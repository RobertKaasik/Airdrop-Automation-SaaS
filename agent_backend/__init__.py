"""
Agent Backend Module

Automated transaction generation and execution management for VIP tier users.

Structure:
- config/: Tier configuration and constants
- models/: Pydantic data models for tasks and telemetry
- routers/: FastAPI route handlers
- services/: Business logic (gas calculation, task generation, payload building)
- database/: Database schema and utilities

Security:
- All endpoints require VIP tier validation (level >= 3)
- Tasks must have complete, validated payloads (no empty calldata)
- Tier checking uses numeric levels for scalability
"""

from .config import (
    SUBSCRIPTION_TIERS,
    AGENT_MODE_MIN_LEVEL,
    is_agent_mode_allowed,
    get_tier_info
)
from .models import (
    AgentTask,
    TelemetryReport,
    TasksResponse,
    TelemetryResponse,
    GasParams,
    ExecutionWindow
)
from .routers import tasks_router, telemetry_router
from .services import GasStrategy, TaskGenerator, PayloadBuilder

__version__ = "0.1.0"

__all__ = [
    "SUBSCRIPTION_TIERS",
    "AGENT_MODE_MIN_LEVEL",
    "is_agent_mode_allowed",
    "get_tier_info",
    "AgentTask",
    "TelemetryReport",
    "TasksResponse",
    "TelemetryResponse",
    "GasParams",
    "ExecutionWindow",
    "tasks_router",
    "telemetry_router",
    "GasStrategy",
    "TaskGenerator",
    "PayloadBuilder"
]
