"""Task router for agent backend."""

from fastapi import APIRouter, Header, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional
import time

from ..models import TasksResponse, AgentTask
from ..config import get_tier_info, AGENT_MODE_MIN_LEVEL

router = APIRouter()


@router.get("/api/companion/tasks", response_model=TasksResponse)
async def get_agent_tasks(
    token: str = Header(..., alias="X-Airdrop-X-Companion")
):
    """
    Returns pending executable tasks for premium agents only.
    Double-checks tier level on every request.
    
    CRITICAL: Never emit tasks with empty calldata/to/chainId.
    """
    # TODO: Implement user verification and tier checking
    # TODO: Fetch pending tasks from database
    # TODO: Filter by execution window
    
    # Placeholder response
    return TasksResponse(
        tasks=[],
        tier_level=0,
        auto_mode_allowed=False
    )
