"""Task-related data models for agent backend."""

from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal


class AgentTask(BaseModel):
    """Executable task model for automated agent."""
    task_id: str
    wallet_id: int
    schedule_id: Optional[int] = None
    chain_id: int
    to_address: str = Field(..., min_length=42, max_length=42)
    calldata: str = Field(..., min_length=3)  # Must be at least "0x" + data
    value_wei: str = "0"
    max_fee_per_gas: str
    max_priority_fee_per_gas: str
    execution_window_start_utc: int
    execution_window_end_utc: int
    protocol: str
    wallet_address: str = Field(..., min_length=42, max_length=42)
    status: str = "pending"
    
    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "550e8400-e29b-41d4-a716-446655440000",
                "wallet_id": 1,
                "schedule_id": 42,
                "chain_id": 8453,
                "to_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "calldata": "0xa9059cbb000000000000000000000000...",
                "value_wei": "0",
                "max_fee_per_gas": "1000000000",
                "max_priority_fee_per_gas": "1000000",
                "execution_window_start_utc": 1735689600,
                "execution_window_end_utc": 1735693200,
                "protocol": "uniswap_v3",
                "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
                "status": "pending"
            }
        }


class TelemetryReport(BaseModel):
    """Execution telemetry report from desktop agent."""
    task_id: str
    tx_hash: Optional[str] = None
    status: str  # success|failed|rejected
    gas_used: Optional[int] = None
    error_message: Optional[str] = None
    executed_at_utc: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "550e8400-e29b-41d4-a716-446655440000",
                "tx_hash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                "status": "success",
                "gas_used": 150000,
                "error_message": None,
                "executed_at_utc": 1735689700
            }
        }


class TasksResponse(BaseModel):
    """Response model for GET /api/companion/agent/tasks."""
    tasks: list[AgentTask]
    tier_level: int
    auto_mode_allowed: bool


class TelemetryResponse(BaseModel):
    """Response model for POST /api/companion/telemetry."""
    status: str
    message: str
    task_id: str
