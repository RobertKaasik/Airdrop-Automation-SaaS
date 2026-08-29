"""Execution-related data models for agent backend."""

from pydantic import BaseModel
from typing import Optional


class GasParams(BaseModel):
    """EIP-1559 gas parameters with safety buffers."""
    max_fee_per_gas: str
    max_priority_fee_per_gas: str
    base_fee: str
    priority_fee: str
    buffer_multiplier: float
    
    class Config:
        json_schema_extra = {
            "example": {
                "max_fee_per_gas": "1200000000",
                "max_priority_fee_per_gas": "1100000",
                "base_fee": "1000000000",
                "priority_fee": "1000000",
                "buffer_multiplier": 1.2
            }
        }


class ExecutionWindow(BaseModel):
    """UTC-based execution time window."""
    start_utc: int
    end_utc: int
    timezone: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "start_utc": 1735689600,
                "end_utc": 1735693200,
                "timezone": "UTC"
            }
        }
