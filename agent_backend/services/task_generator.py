"""Task generation service."""

from typing import List, Optional
from ..models import AgentTask


class TaskGenerator:
    """Generate executable tasks from schedules."""
    
    async def generate_tasks_for_schedule(
        self,
        schedule: dict
    ) -> List[AgentTask]:
        """
        Convert schedule into executable task(s).
        
        Flow:
        1. Check if execution window active (UTC)
        2. Determine protocol (dex/bridge/lending)
        3. Build payload using existing builders
        4. Validate payload completeness
        5. Calculate gas params
        6. Return task or raise ValidationError
        """
        # TODO: Implement schedule to task conversion
        # TODO: Integrate with existing DEX/bridge/lending builders
        # TODO: Validate all required fields
        # TODO: Calculate execution window
        # TODO: Calculate gas parameters
        
        return []
    
    async def validate_task_payload(self, task: AgentTask) -> bool:
        """
        Validate that task has complete, executable payload.
        
        Returns:
            True if valid, raises ValidationError otherwise
        """
        # CRITICAL validation rules:
        # - calldata must not be empty (length > 2 for "0x")
        # - to_address must be valid checksummed address
        # - chain_id must be supported network
        # - execution_window must be in future
        
        if not task.calldata or len(task.calldata) <= 2:
            raise ValueError("Invalid task: empty calldata")
        
        if not task.to_address or len(task.to_address) != 42:
            raise ValueError("Invalid task: invalid to_address")
        
        if task.chain_id not in [1, 8453, 42161, 10]:  # Example supported chains
            raise ValueError(f"Invalid task: unsupported chain_id {task.chain_id}")
        
        return True
