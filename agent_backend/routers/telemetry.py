"""Telemetry router for agent backend."""

from fastapi import APIRouter, Header, HTTPException, Depends
from sqlalchemy.orm import Session
import time

from ..models import TelemetryReport, TelemetryResponse
from .tasks import verify_companion_token, get_db

router = APIRouter()


@router.post("/api/companion/telemetry", response_model=TelemetryResponse)
async def submit_telemetry(
    report: TelemetryReport,
    token: str = Header(..., alias="X-Airdrop-X-Companion"),
    db: Session = Depends(get_db)
):
    """Stores agent execution telemetry."""
    user = verify_companion_token(token, db)

    print(
        f"[Telemetry] user={user.username} task={report.task_id} "
        f"status={report.status} tx={report.tx_hash} at={report.executed_at_utc}"
    )

    return TelemetryResponse(
        status="ok",
        message="Telemetry recorded",
        task_id=report.task_id,
    )
