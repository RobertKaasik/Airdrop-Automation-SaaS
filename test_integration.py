"""Local integration checks for AIRDROP-X core services.

The test uses the project's SQLite database, but every record created here has
a unique prefix and is removed in ``finally``. Playwright is replaced with a
small in-memory fake, so this script never launches a browser, contacts a
proxy, wallet, exchange, or blockchain endpoint.

Run:
    python test_integration.py
"""

import asyncio
import shutil
import uuid
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

# Importing server registers the existing User model on the shared Base.
from server import User

import core.browser_profile_manager as profile_module
from core.browser_profile_manager import BrowserProfileManager, ProfileBusyError
from core.database import SessionLocal, engine, init_db
from core.models import FinancialTransferIntent, ProfileRun, UserProfile


class IntegrationFailure(AssertionError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise IntegrationFailure(message)


class FakeContext:
    def __init__(self) -> None:
        self._listeners: dict[str, list] = {}
        self.closed = False
        self.init_script: str | None = None

    def on(self, event_name: str, callback) -> None:
        self._listeners.setdefault(event_name, []).append(callback)

    async def add_init_script(self, script: str) -> None:
        """Record Playwright's startup script without evaluating it in a test."""
        self.init_script = script

    async def close(self) -> None:
        self.closed = True


class FakeChromium:
    async def launch_persistent_context(self, **_options) -> FakeContext:
        return FakeContext()


class FakePlaywright:
    def __init__(self) -> None:
        self.chromium = FakeChromium()
        self.stopped = False

    async def stop(self) -> None:
        self.stopped = True


class FakePlaywrightLauncher:
    async def start(self) -> FakePlaywright:
        return FakePlaywright()


def verify_schema() -> None:
    init_db()
    tables = set(inspect(engine).get_table_names())
    required = {
        "users",
        "user_profiles",
        "profile_runs",
        "financial_transfer_intents",
    }
    require(required.issubset(tables), "Не созданы все таблицы ядра.")


def create_test_data(prefix: str) -> tuple[int, int, int]:
    with SessionLocal() as db:
        owner = User(
            username=f"{prefix}_owner",
            email=f"{prefix}_owner@example.invalid",
            password_hash="integration-test-only",
        )
        another_user = User(
            username=f"{prefix}_other",
            email=f"{prefix}_other@example.invalid",
            password_hash="integration-test-only",
        )
        db.add_all((owner, another_user))
        db.flush()

        profile = UserProfile(
            user_id=owner.id,
            profile_name=f"{prefix}_profile",
            evm_wallet_address="0x0000000000000000000000000000000000000001",
            environment_metadata={
                "viewport": {"width": 1280, "height": 720},
                "locale": "ru-RU",
            },
            status="active",
        )
        db.add(profile)
        db.commit()

        require(profile.user_id == owner.id, "Профиль не привязан к владельцу.")

        inaccessible = (
            db.query(UserProfile)
            .filter(
                UserProfile.id == profile.id,
                UserProfile.user_id == another_user.id,
            )
            .first()
        )
        require(inaccessible is None, "Профиль доступен другому пользователю.")

        return owner.id, another_user.id, profile.id


def verify_transfer_intent(owner_id: int, profile_id: int) -> int:
    with SessionLocal() as db:
        intent = FinancialTransferIntent(
            user_id=owner_id,
            profile_id=profile_id,
            operation_type="test_transfer",
            asset="USDC",
            amount="1.25",
            target_address="0x0000000000000000000000000000000000000002",
            status="pending_approval",
        )
        db.add(intent)
        db.commit()

        require(intent.id is not None, "Намерение не сохранено.")
        require(intent.status == "pending_approval", "Статус намерения неверный.")

        invalid_intent = FinancialTransferIntent(
            user_id=owner_id,
            profile_id=profile_id,
            operation_type="test_transfer",
            asset="USDC",
            amount="1.25",
            target_address="0x0000000000000000000000000000000000000002",
            status="invalid_status",
        )
        db.add(invalid_intent)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        else:
            raise IntegrationFailure(
                "Недопустимый статус FinancialTransferIntent был сохранён."
            )

        return intent.id


async def verify_profile_lock(owner_id: int, profile_id: int) -> None:
    original_async_playwright = profile_module.async_playwright
    profile_module.async_playwright = lambda: FakePlaywrightLauncher()

    try:
        artifacts_dir = Path(__file__).resolve().parent / ".integration-test-artifacts"
        artifacts_dir.mkdir(exist_ok=True)

        temp_dir = artifacts_dir / f"profile-{uuid.uuid4().hex}"
        temp_dir.mkdir()
        try:
            manager = BrowserProfileManager(
                base_profiles_path=str(temp_dir),
                headless=True,
            )

            context = await manager.launch_profile(profile_id, owner_id)
            require(isinstance(context, FakeContext), "Тестовый контекст не запущен.")

            with SessionLocal() as db:
                runs = (
                    db.query(ProfileRun)
                    .filter(
                        ProfileRun.profile_id == profile_id,
                        ProfileRun.user_id == owner_id,
                    )
                    .order_by(ProfileRun.id.asc())
                    .all()
                )
                require(len(runs) == 1, "Создано неверное число ProfileRun.")
                require(runs[0].status == "running", "ProfileRun не перешёл в running.")

            try:
                await manager.launch_profile(profile_id, owner_id)
            except ProfileBusyError:
                pass
            else:
                raise IntegrationFailure("Повторный запуск не был заблокирован lock-файлом.")

            with SessionLocal() as db:
                run_count = (
                    db.query(ProfileRun)
                    .filter(
                        ProfileRun.profile_id == profile_id,
                        ProfileRun.user_id == owner_id,
                    )
                    .count()
                )
                require(run_count == 1, "При занятом профиле создан лишний ProfileRun.")

            closed = await manager.close_profile(profile_id)
            require(closed, "Менеджер не закрыл активный профиль.")
            require(context.closed, "Контекст не был закрыт.")

            with SessionLocal() as db:
                run = (
                    db.query(ProfileRun)
                    .filter(
                        ProfileRun.profile_id == profile_id,
                        ProfileRun.user_id == owner_id,
                    )
                    .one()
                )
                require(run.status == "completed", "ProfileRun не завершён корректно.")
                require(run.end_time is not None, "У завершённого ProfileRun нет end_time.")
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    finally:
        profile_module.async_playwright = original_async_playwright


def cleanup(prefix: str) -> None:
    with SessionLocal() as db:
        profiles = (
            db.query(UserProfile.id)
            .filter(UserProfile.profile_name.like(f"{prefix}%"))
            .all()
        )
        profile_ids = [profile_id for (profile_id,) in profiles]

        if profile_ids:
            db.query(FinancialTransferIntent).filter(
                FinancialTransferIntent.profile_id.in_(profile_ids)
            ).delete(synchronize_session=False)
            db.query(ProfileRun).filter(ProfileRun.profile_id.in_(profile_ids)).delete(
                synchronize_session=False
            )
            db.query(UserProfile).filter(UserProfile.id.in_(profile_ids)).delete(
                synchronize_session=False
            )

        db.query(User).filter(User.username.like(f"{prefix}%")).delete(
            synchronize_session=False
        )
        db.commit()


def main() -> None:
    prefix = f"__integration_{uuid.uuid4().hex[:12]}"

    try:
        verify_schema()
        owner_id, _another_user_id, profile_id = create_test_data(prefix)
        verify_transfer_intent(owner_id, profile_id)
        asyncio.run(verify_profile_lock(owner_id, profile_id))
        print("PASS: database ownership, transfer intent, and profile lock checks passed.")
    finally:
        cleanup(prefix)


if __name__ == "__main__":
    main()
