"""Telemetry router for agent backend."""

from fastapi import APIRouter, Header, HTTPException
from ..models import TelemetryReport, TelemetryResponse

router = APIRouter()


@router.post("/api/companion/telemetry", response_model=TelemetryResponse)
async def submit_telemetry(
    report: TelemetryReport,
    token: str = Header(..., alias="X-Airdrop-X-Companion")
):
    """
    Records execution results from desktop agent.
    Updates task status and stores execution metrics.
    """
    # TODO: Verify token and get user
    # TODO: Update task status in database
    # TODO: Store telemetry data
    # TODO: Trigger alerts on consecutive failures
    
    return TelemetryResponse(
        status="success",
        message="Telemetry recorded",
        task_id=report.task_id
    )
