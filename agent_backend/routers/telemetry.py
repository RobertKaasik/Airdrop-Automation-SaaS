"""Telemetry router for agent backend."""

from fastapi import APIRouter, Header, HTTPException, Depends
from sqlalchemy.orm import Session
import time

# Import from parent server.py
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import SessionLocal

from ..models import TelemetryReport, TelemetryResponse
from .tasks import verify_companion_token

router = APIRouter()


def get_db():
    """Database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/api/companion/telemetry", response_model=TelemetryResponse)
async def submit_telemetry(
    report: TelemetryReport,
    token: str = Header(..., alias="X-Airdrop-X-Companion"),
    db: Session = Depends(get_db)
):
    """
    Stores agent execution telemetry.
    
    Records:
    - Task ID and execution status
    - Transaction hash (if successful)
    - Gas usage
    - Error details (if failed)
    - Execution timestamp
    """
    # 1. Verify token
    user = verify_companion_token(token, db)
    
    # 2. Validate telemetry data
    if not report.task_id:
        raise HTTPException(status_code=400, detail="Missing task_id")
    
    if report.status not in ["success", "failed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # 3. Store in database
    # NOTE: This requires creating agent_tasks and task_telemetry tables
    # For now, we just log the telemetry
    print(f"[Telemetry] User {user.username} - Task {report.task_id}: {report.status}")
    
    if report.tx_hash:
        print(f"[Telemetry] Transaction hash: {report.tx_hash}")
    
    if report.error_message:
        print(f"[Telemetry] Error: {report.error_message}")
    
    # In production, insert into task_telemetry table here
    # db.execute(
    #     insert(TaskTelemetry).values(
    #         task_id=report.task_id,
    #         username=user.username,
    #         tx_hash=report.tx_hash,
    #         status=report.status,
    #         gas_used=report.gas_used,
    #         error_message=report.error_message,
    #         executed_at_utc=report.executed_at_utc,
    #         created_at=int(time.time())
    #     )
    # )
    # db.commit()
    
    return TelemetryResponse(
        success=True,
        message="Telemetry recorded"
    )
