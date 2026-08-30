"""Task router for agent backend."""

from fastapi import APIRouter, Header, HTTPException, Depends
from sqlalchemy.orm import Session
import time
import hashlib

from ..models import TasksResponse
from ..config import get_tier_info, AGENT_MODE_MIN_LEVEL

router = APIRouter()


def _server():
    """Lazy import to avoid circular dependency with server.py."""
    import server as server_module
    return server_module


def get_db():
    """Database session dependency."""
    SessionLocal = _server().SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_companion_token(token: str, db: Session):
    """
    Verify companion token and return associated user.
    """
    server = _server()
    if not token:
        raise HTTPException(status_code=401, detail="Missing companion token")

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now_ts = int(time.time())
    session = db.query(server.DesktopCompanionSession).filter(
        server.DesktopCompanionSession.token_hash == token_hash,
        server.DesktopCompanionSession.expires_at > now_ts
    ).first()

    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    session.last_seen_at = now_ts
    db.commit()

    user = db.query(server.User).filter(server.User.username == session.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


@router.get("/api/companion/agent/tasks", response_model=TasksResponse)
async def get_agent_tasks(
    token: str = Header(..., alias="X-Airdrop-X-Companion"),
    db: Session = Depends(get_db)
):
    """
    Returns pending executable tasks for premium agents only.
    Path is separate from /api/companion/tasks (reminder metadata).
    """
    server = _server()
    user = verify_companion_token(token, db)

    subscription_plan = user.subscription_plan or "Standard"
    tier_info = get_tier_info(subscription_plan)
    tier_level = tier_info["level"]

    if tier_level < AGENT_MODE_MIN_LEVEL:
        raise HTTPException(
            status_code=403,
            detail={
                "error": f"Premium subscription (Level {AGENT_MODE_MIN_LEVEL}+) required for automated agent mode",
                "user_tier": subscription_plan,
                "tier_level": tier_level,
                "required_level": AGENT_MODE_MIN_LEVEL,
                "auto_mode_allowed": False
            }
        )

    schedules = db.query(server.WalletActionSchedule).join(
        server.Wallet, server.Wallet.id == server.WalletActionSchedule.wallet_id
    ).filter(
        server.WalletActionSchedule.username == user.username,
        server.WalletActionSchedule.enabled == True
    ).all()

    wallet_ids = {schedule.wallet_id for schedule in schedules}
    wallets = db.query(server.Wallet).filter(server.Wallet.id.in_(wallet_ids)).all() if wallet_ids else []
    wallet_map = {wallet.id: wallet for wallet in wallets}

    from ..services.task_generator import get_task_generator
    task_generator = get_task_generator()
    tasks = await task_generator.generate_tasks_from_schedules(schedules, wallet_map)

    print(f"[TaskAPI] Generated {len(tasks)} tasks for user {user.username}")

    return TasksResponse(
        tasks=tasks,
        tier_level=tier_level,
        auto_mode_allowed=True
    )
