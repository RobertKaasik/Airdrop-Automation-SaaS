"""Local integration checks for AIRDROP-X core services.

The test uses the project's SQLite database, but every record created here has
a unique prefix and is removed in ``finally``. Playwright is replaced with a
small in-memory fake, so this script never launches a browser, contacts a
proxy, wallet, exchange, or blockchain endpoint.

Run:
    python test_integration.py
"""

import os
import asyncio
import re
import shutil
import time
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
from core.protocols import BRIDGES_ADAPTERS, DEX_ADAPTERS, LENDING_ADAPTERS
from core.protocols.base import ProtocolAdapterUnavailable
from core.protocols.bridges.lifi import LifiAdapter
from core.protocols.dex.uniswap import UniswapAdapter
from core.protocols.lending.aave_v3 import AaveV3Adapter


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
    checkout_columns = {column["name"] for column in inspect(engine).get_columns("payment_checkout_sessions")}
    require(
        {"username", "purpose"}.issubset(checkout_columns),
        "Платёжная сессия не различает регистрацию и продление подписки.",
    )


def verify_subscription_lifecycle() -> None:
    from server import (
        SUBSCRIPTION_DURATION_SECONDS,
        SUBSCRIPTION_GRACE_PERIOD_SECONDS,
        get_subscription_state,
    )

    now_ts = int(time.time())
    active_user = User(subscription_activated_at=now_ts - 60)
    grace_user = User(subscription_activated_at=now_ts - SUBSCRIPTION_DURATION_SECONDS - 60)
    expired_user = User(
        subscription_activated_at=(
            now_ts - SUBSCRIPTION_DURATION_SECONDS - SUBSCRIPTION_GRACE_PERIOD_SECONDS - 60
        )
    )
    require(get_subscription_state(active_user, now_ts)["status"] == "active", "Active subscription state failed.")
    require(get_subscription_state(grace_user, now_ts)["status"] == "grace", "Subscription grace state failed.")
    require(get_subscription_state(expired_user, now_ts)["status"] == "expired", "Expired subscription state failed.")


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
            proxy_configuration="socks5://admin:pass@127.0.0.1:1080",
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


def verify_action_center_mvp_requirements() -> None:
    # 1. Verification of RU/EN/ZH translations and old tabs exclusion
    for lang in ["en", "ru", "zh"]:
        p = Path(__file__).resolve().parent / "locales" / f"{lang}.js"
        with open(p, "r", encoding="utf-8") as f:
            content = f.read()
        assert "activityTabDex" in content, f"activityTabDex missing in {lang}"
        assert "activityTabBridges" in content, f"activityTabBridges missing in {lang}"
        assert "activityTabLending" in content, f"activityTabLending missing in {lang}"
        assert "activityTabJournal" in content, f"activityTabJournal missing in {lang}"
        
    # 2. Check that the backend has no transaction signing methods
    for parent, _, files in os.walk(Path(__file__).resolve().parent):
        for file in files:
            if file.endswith(".py") and not file.startswith("test_") and file not in ["collect_code.py"]:
                with open(os.path.join(parent, file), "r", encoding="utf-8", errors="ignore") as f:
                    code = f.read()
                assert "sign_transaction" not in code, f"Unsafe signing method found in {file}"
                assert "send_raw_transaction" not in code, f"Unsafe signing execution found in {file}"

    # 3. Schedule type migration check
    from server import migrate_schedules, WalletActionSchedule, Wallet
    with SessionLocal() as db:
        test_user = db.query(User).filter(User.username == "qa_user_test").first()
        if not test_user:
            test_user = User(username="qa_user_test", email="qa@test.com", password_hash="123")
            db.add(test_user)
            db.flush()
        
        wallet = Wallet(username="qa_user_test", wallet_address="0x1111111111111111111111111111111111111111")
        db.add(wallet)
        db.flush()

        s1 = WalletActionSchedule(username="qa_user_test", wallet_id=wallet.id, action_type="swap", day_of_week="Mon", time_of_day="12:00", created_at=0, updated_at=0)
        s2 = WalletActionSchedule(username="qa_user_test", wallet_id=wallet.id, action_type="defi", day_of_week="Mon", time_of_day="12:00", created_at=0, updated_at=0)
        s3 = WalletActionSchedule(username="qa_user_test", wallet_id=wallet.id, action_type="bridge", day_of_week="Mon", time_of_day="12:00", created_at=0, updated_at=0)
        s4 = WalletActionSchedule(username="qa_user_test", wallet_id=wallet.id, action_type="quests", day_of_week="Mon", time_of_day="12:00", created_at=0, updated_at=0)
        
        db.add_all([s1, s2, s3, s4])
        db.commit()

        # Run migration
        migrate_schedules()

        # Verify
        db.refresh(s1)
        db.refresh(s2)
        db.refresh(s3)
        db.refresh(s4)

        assert s1.action_type == "dex", "Migration swap -> dex failed"
        assert s2.action_type == "lending", "Migration defi -> lending failed"
        assert s3.action_type == "bridge", "Bridge should stay bridge"
        assert s4.enabled == False, "Unknown format should be disabled"

        # Cleanup
        db.query(WalletActionSchedule).filter(
            WalletActionSchedule.id.in_([s1.id, s2.id, s3.id, s4.id])
        ).delete(synchronize_session=False)
        db.delete(wallet)
        db.delete(test_user)
        db.commit()

    print("PASS: verify_action_center_mvp_requirements migration, security and localization checks passed.")


def verify_protocol_routes_fail_closed() -> None:
    """Prevent placeholder quotes or transactions from re-entering production paths."""
    require(DEX_ADAPTERS == {}, "Legacy DEX adapters must not be registered.")
    require(BRIDGES_ADAPTERS == {}, "Legacy bridge adapters must not be registered.")
    require(LENDING_ADAPTERS == {}, "Legacy lending adapters must not be registered.")

    checks = [
        (UniswapAdapter(), "get_quote", {"amount": "1"}),
        (LifiAdapter(), "build_transaction", {"amount": "1"}),
        (AaveV3Adapter(), "get_market_data", {"asset": "USDC"}),
    ]
    for adapter, method_name, payload in checks:
        try:
            getattr(adapter, method_name)(payload)
        except ProtocolAdapterUnavailable:
            pass
        else:
            raise IntegrationFailure(
                f"{adapter.provider_name}.{method_name} returned fabricated provider data."
            )

    root = Path(__file__).resolve().parent
    server_source = (root / "server.py").read_text(encoding="utf-8")
    app_source = (root / "app.js").read_text(encoding="utf-8")

    for disabled_route in (
        "This obsolete DEX endpoint is disabled",
        "This obsolete bridge endpoint is disabled",
        "This obsolete lending endpoint is disabled",
        "Generic transaction submission is disabled",
    ):
        require(disabled_route in server_source, f"Missing fail-closed route: {disabled_route}")

    for production_route in (
        "/api/base-swap/quote",
        "/api/universal-bridge/quote",
        "/api/defi/aave-base/usdc-supply-quote",
        "/api/defi/aave-base/usdc-withdraw-quote",
    ):
        require(production_route in app_source, f"Frontend is not wired to {production_route}")

    require(
        "sourceNetwork === destinationNetwork" in app_source,
        "Bridge UI must reject equal source and destination networks.",
    )
    require(
        "return requestBaseSwapQuote();" in app_source
        and "return requestUniversalBridgeQuote();" in app_source
        and "return buildVerifiedLendingOperation();" in app_source,
        "Legacy UI handlers are not safely delegated.",
    )
    print("PASS: protocol adapters fail closed and the UI uses verified provider routes.")


def verify_ui_interaction_contracts() -> None:
    """Catch missing inline handlers and regressions in frequently used controls."""
    root = Path(__file__).resolve().parent
    index_source = (root / "index.html").read_text(encoding="utf-8")
    app_source = (root / "app.js").read_text(encoding="utf-8")
    style_source = (root / "style.css").read_text(encoding="utf-8")
    combined = f"{index_source}\n{app_source}"

    handlers = {
        name
        for name in re.findall(r'onclick="([A-Za-z_][A-Za-z0-9_]*)', combined)
        if name not in {"event", "if", "document"}
    }
    definitions = set(re.findall(r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", combined))
    definitions.update(
        re.findall(r"(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=", combined)
    )
    missing_handlers = sorted(handlers - definitions)
    require(not missing_handlers, f"Inline handlers without definitions: {missing_handlers}")

    require("<span onclick=" not in combined, "Clickable spans must be semantic buttons.")
    require("function toggleFaq(item)" in app_source, "FAQ toggle handler is missing.")
    require(
        'class="faq-question"' in index_source and "aria-expanded" in index_source,
        "FAQ questions are not keyboard-accessible buttons.",
    )
    require(".faq-question:focus-visible" in style_source, "FAQ keyboard focus is not visible.")
    require(
        "input.value = String(maxLimit);" in app_source,
        "Numeric upper limits are only decorated instead of enforced.",
    )

    required_locale_keys = {
        "walletProxyChecking",
        "walletProxyOk",
        "walletProxySlow",
        "walletProxyFailed",
        "activityTabDex",
        "defiOverviewSupplied",
        "defiOverviewBorrowed",
        "labelProtocol",
    }
    for language in ("ru", "en", "zh"):
        source = (root / "locales" / f"{language}.js").read_text(encoding="utf-8")
        missing_keys = sorted(key for key in required_locale_keys if key not in source)
        require(not missing_keys, f"Missing {language} interaction labels: {missing_keys}")
        backend_block = re.search(r"backend:\s*\{(.*?)\n\s*\},", source, flags=re.DOTALL)
        require(backend_block is not None, f"Missing {language} backend translation block.")
        require(
            "activityTabDex" not in backend_block.group(1),
            f"{language} Action Center labels are nested inside backend errors.",
        )

    print(f"PASS: {len(handlers)} UI handlers and key interaction contracts verified.")


def main() -> None:
    prefix = f"__integration_{uuid.uuid4().hex[:12]}"

    try:
        verify_schema()
        verify_subscription_lifecycle()
        owner_id, _another_user_id, profile_id = create_test_data(prefix)
        verify_transfer_intent(owner_id, profile_id)
        asyncio.run(verify_profile_lock(owner_id, profile_id))
        verify_action_center_mvp_requirements()
        verify_protocol_routes_fail_closed()
        verify_ui_interaction_contracts()
        print("PASS: database ownership, transfer intent, and profile lock checks passed.")
    finally:
        cleanup(prefix)


if __name__ == "__main__":
    main()
