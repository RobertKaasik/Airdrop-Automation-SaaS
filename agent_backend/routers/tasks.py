"""Task router for agent backend."""

from fastapi import APIRouter, Header, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
import time
import hashlib

# Import from parent server.py
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import (
    SessionLocal, 
    User, 
    DesktopCompanionSession,
    WalletActionSchedule,
    Wallet
)

from ..models import TasksResponse, AgentTask
from ..config import get_tier_info, AGENT_MODE_MIN_LEVEL
from ..services.task_generator import get_task_generator

router = APIRouter()


def get_db():
    """Database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_companion_token(token: str, db: Session):
    """
    Verify companion token and return associated user.
    
    Returns:
        User object if token is valid
    
    Raises:
        HTTPException if token is invalid or expired
    """
    if not token:
        raise HTTPException(status_code=401, detail="Missing companion token")
    
    # Hash the token to look up session
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    
    # Find session
    now_ts = int(time.time())
    session = db.query(DesktopCompanionSession).filter(
        DesktopCompanionSession.token_hash == token_hash,
        DesktopCompanionSession.expires_at > now_ts
    ).first()
    
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    # Update last seen
    session.last_seen_at = now_ts
    db.commit()
    
    # Get user
    user = db.query(User).filter(User.username == session.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user


@router.get("/api/companion/tasks", response_model=TasksResponse)
async def get_agent_tasks(
    token: str = Header(..., alias="X-Airdrop-X-Companion"),
    db: Session = Depends(get_db)
):
    """
    Returns pending executable tasks for premium agents only.
    Double-checks tier level on every request.
    
    CRITICAL: Never emit tasks with empty calldata/to/chainId.
    """
    # 1. Verify token and get user
    user = verify_companion_token(token, db)
    
    # 2. Get tier information
    subscription_plan = user.subscription_plan or "Standard"
    tier_info = get_tier_info(subscription_plan)
    tier_level = tier_info["level"]
    
    # 3. CRITICAL: Enforce tier gating
    if tier_level < AGENT_MODE_MIN_LEVEL:
        raise HTTPException(
            status_code=403,
            detail={
                "error": f"Premium VIP subscription (Level {AGENT_MODE_MIN_LEVEL}+) required for automated agent mode",
                "user_tier": subscription_plan,
                "tier_level": tier_level,
                "required_level": AGENT_MODE_MIN_LEVEL,
                "auto_mode_allowed": False
            }
        )
    
    # 4. Fetch user's active schedules
    schedules = db.query(WalletActionSchedule).join(
        Wallet, Wallet.id == WalletActionSchedule.wallet_id
    ).filter(
        WalletActionSchedule.username == user.username,
        WalletActionSchedule.enabled == True
    ).all()
    
    # 5. Fetch associated wallets
    wallet_ids = {schedule.wallet_id for schedule in schedules}
    wallets = db.query(Wallet).filter(Wallet.id.in_(wallet_ids)).all()
    wallet_map = {wallet.id: wallet for wallet in wallets}
    
    # 6. Generate executable tasks from schedules
    task_generator = get_task_generator()
    tasks = await task_generator.generate_tasks_from_schedules(schedules, wallet_map)
    
    print(f"[TaskAPI] Generated {len(tasks)} tasks for user {user.username}")
    
    return TasksResponse(
        tasks=tasks,
        tier_level=tier_level,
        auto_mode_allowed=True
    )
