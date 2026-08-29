"""Task generation service - converts schedules to executable blockchain transactions."""

import time
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import pytz

# Import from parent server
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import (
    WalletActionSchedule,
    Wallet,
    BASE_CHAIN_ID,
    BASE_USDC_ADDRESS,
    AAVE_V3_BASE_POOL,
    build_aave_supply_calldata,
    build_aave_withdraw_calldata,
    normalize_token_amount,
    UNISWAP_TRADE_API_URL,
    LIFI_API_URL,
    LIFI_EVM_NETWORKS,
    uniswap_headers,
    lifi_headers
)

from ..models import AgentTask, ExecutionWindow
from .gas_strategy import get_gas_strategy

import requests


WEEKDAY_MAP = {
    "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, 
    "Thu": 4, "Fri": 5, "Sat": 6
}


class TaskGenerator:
    """
    Converts WalletActionSchedule records into executable AgentTask objects.
    
    Responsibilities:
    - Parse schedule timing and calculate execution windows
    - Generate transaction payloads for different action types
    - Integrate with existing DEX/bridge/lending builders
    - Apply dynamic gas parameters
    - Validate all outputs before returning
    """
    
    def __init__(self):
        self.gas_strategy = get_gas_strategy()
    
    async def generate_tasks_from_schedules(
        self,
        schedules: List[WalletActionSchedule],
        wallets: Dict[int, Wallet]
    ) -> List[AgentTask]:
        """
        Main entry point: convert schedules to executable tasks.
        
        Args:
            schedules: List of active WalletActionSchedule records
            wallets: Dictionary mapping wallet_id -> Wallet object
        
        Returns:
            List of AgentTask objects ready for execution
        """
        tasks = []
        
        for schedule in schedules:
            try:
                wallet = wallets.get(schedule.wallet_id)
                if not wallet:
                    print(f"[TaskGen] Skipping schedule {schedule.id}: wallet not found")
                    continue
                
                # Check if this schedule is due for execution
                execution_window = self._calculate_execution_window(schedule)
                if not execution_window:
                    # Not due yet
                    continue
                
                # Generate task based on action type
                task = await self._generate_task_for_schedule(
                    schedule,
                    wallet,
                    execution_window
                )
                
                if task:
                    tasks.append(task)
            
            except Exception as error:
                print(f"[TaskGen] Error generating task for schedule {schedule.id}: {error}")
                continue
        
        return tasks
    
    def _calculate_execution_window(
        self,
        schedule: WalletActionSchedule
    ) -> Optional[ExecutionWindow]:
        """
        Calculate if schedule is due and return execution window.
        
        Returns:
            ExecutionWindow if schedule is due, None otherwise
        """
        now_utc = datetime.now(pytz.UTC)
        
        # Parse schedule time
        try:
            schedule_tz = pytz.timezone(schedule.timezone)
        except Exception:
            schedule_tz = pytz.UTC
        
        # Get current time in schedule's timezone
        now_local = now_utc.astimezone(schedule_tz)
        
        # Parse day of week and time
        target_weekday = WEEKDAY_MAP.get(schedule.day_of_week)
        if target_weekday is None:
            print(f"[TaskGen] Invalid day_of_week: {schedule.day_of_week}")
            return None
        
        # Parse time of day (e.g., "14:30")
        try:
            hour, minute = map(int, schedule.time_of_day.split(":"))
        except Exception:
            print(f"[TaskGen] Invalid time_of_day: {schedule.time_of_day}")
            return None
        
        # Calculate next occurrence
        days_ahead = (target_weekday - now_local.weekday()) % 7
        if days_ahead == 0:
            # Today - check if time has passed
            target_time = now_local.replace(
                hour=hour,
                minute=minute,
                second=0,
                microsecond=0
            )
            if target_time < now_local:
                # Already passed today, schedule for next week
                days_ahead = 7
        
        target_datetime = now_local + timedelta(days=days_ahead)
        target_datetime = target_datetime.replace(
            hour=hour,
            minute=minute,
            second=0,
            microsecond=0
        )
        
        # Convert to UTC
        target_utc = target_datetime.astimezone(pytz.UTC)
        
        # Execution window: ±30 minutes from target time
        window_start = target_utc - timedelta(minutes=30)
        window_end = target_utc + timedelta(minutes=30)
        
        # Check if we're in the window
        if not (window_start <= now_utc <= window_end):
            return None
        
        return ExecutionWindow(
            start_utc=int(window_start.timestamp()),
            end_utc=int(window_end.timestamp())
        )
    
    async def _generate_task_for_schedule(
        self,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow
    ) -> Optional[AgentTask]:
        """Generate specific task based on action type."""
        
        action_type = schedule.action_type.lower()
        
        if action_type in ["swap", "base_swap"]:
            return await self._generate_swap_task(schedule, wallet, execution_window)
        
        elif action_type in ["bridge", "universal_bridge"]:
            return await self._generate_bridge_task(schedule, wallet, execution_window)
        
        elif action_type in ["aave_supply", "lending_supply"]:
            return await self._generate_aave_supply_task(schedule, wallet, execution_window)
        
        elif action_type in ["aave_withdraw", "lending_withdraw"]:
            return await self._generate_aave_withdraw_task(schedule, wallet, execution_window)
        
        else:
            print(f"[TaskGen] Unsupported action type: {action_type}")
            return None
    
    async def _generate_swap_task(
        self,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow
    ) -> Optional[AgentTask]:
        """
        Generate swap task using Uniswap API.
        
        NOTE: This is a placeholder. In production, you would:
        1. Parse schedule parameters (token in/out, amount)
        2. Call Uniswap quote API
        3. Call Uniswap build API to get calldata
        4. Return AgentTask with transaction data
        """
        print(f"[TaskGen] Swap task generation not yet implemented for schedule {schedule.id}")
        return None
    
    async def _generate_bridge_task(
        self,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow
    ) -> Optional[AgentTask]:
        """
        Generate bridge task using LI.FI API.
        
        NOTE: This is a placeholder. In production, you would:
        1. Parse schedule parameters (from/to network, token, amount)
        2. Call LI.FI quote API
        3. Extract calldata from quote response
        4. Return AgentTask with transaction data
        """
        print(f"[TaskGen] Bridge task generation not yet implemented for schedule {schedule.id}")
        return None
    
    async def _generate_aave_supply_task(
        self,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow
    ) -> Optional[AgentTask]:
        """
        Generate Aave USDC supply task.
        
        This builds the calldata directly since Aave has a simple interface.
        """
        # For demo purposes, use a small fixed amount (0.1 USDC)
        # In production, parse from schedule parameters
        amount = "0.1"
        
        try:
            # Normalize amount
            normalized_amount, amount_atomic = normalize_token_amount(amount, 6)  # USDC decimals
            
            # Build calldata
            calldata = build_aave_supply_calldata(
                BASE_USDC_ADDRESS,
                amount_atomic,
                wallet.wallet_address
            )
            
            # Get gas parameters
            gas_params = await self.gas_strategy.calculate_gas_params(
                chain_id=BASE_CHAIN_ID,
                priority="normal"
            )
            
            # Create task
            task = AgentTask(
                task_id=f"aave_supply_{schedule.id}_{int(time.time())}",
                wallet_address=wallet.wallet_address,
                chain_id=BASE_CHAIN_ID,
                to_address=AAVE_V3_BASE_POOL,
                calldata=calldata,
                value_wei="0",
                max_fee_per_gas=str(gas_params["max_fee_per_gas"]),
                max_priority_fee_per_gas=str(gas_params["max_priority_fee_per_gas"]),
                execution_window_start_utc=execution_window.start_utc,
                execution_window_end_utc=execution_window.end_utc,
                action_type="aave_supply",
                description=f"Supply {normalized_amount} USDC to Aave V3 on Base"
            )
            
            print(f"[TaskGen] Generated Aave supply task: {task.task_id}")
            return task
            
        except Exception as error:
            print(f"[TaskGen] Error generating Aave supply task: {error}")
            return None
    
    async def _generate_aave_withdraw_task(
        self,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow
    ) -> Optional[AgentTask]:
        """
        Generate Aave USDC withdrawal task.
        """
        # For demo purposes, use a small fixed amount (0.1 USDC)
        # In production, parse from schedule parameters
        amount = "0.1"
        
        try:
            # Normalize amount
            normalized_amount, amount_atomic = normalize_token_amount(amount, 6)  # USDC decimals
            
            # Build calldata
            calldata = build_aave_withdraw_calldata(
                BASE_USDC_ADDRESS,
                amount_atomic,
                wallet.wallet_address
            )
            
            # Get gas parameters
            gas_params = await self.gas_strategy.calculate_gas_params(
                chain_id=BASE_CHAIN_ID,
                priority="normal"
            )
            
            # Create task
            task = AgentTask(
                task_id=f"aave_withdraw_{schedule.id}_{int(time.time())}",
                wallet_address=wallet.wallet_address,
                chain_id=BASE_CHAIN_ID,
                to_address=AAVE_V3_BASE_POOL,
                calldata=calldata,
                value_wei="0",
                max_fee_per_gas=str(gas_params["max_fee_per_gas"]),
                max_priority_fee_per_gas=str(gas_params["max_priority_fee_per_gas"]),
                execution_window_start_utc=execution_window.start_utc,
                execution_window_end_utc=execution_window.end_utc,
                action_type="aave_withdraw",
                description=f"Withdraw {normalized_amount} USDC from Aave V3 on Base"
            )
            
            print(f"[TaskGen] Generated Aave withdraw task: {task.task_id}")
            return task
            
        except Exception as error:
            print(f"[TaskGen] Error generating Aave withdraw task: {error}")
            return None


# Singleton instance
_task_generator_instance: Optional[TaskGenerator] = None


def get_task_generator() -> TaskGenerator:
    """Get or create task generator singleton."""
    global _task_generator_instance
    
    if _task_generator_instance is None:
        _task_generator_instance = TaskGenerator()
    
    return _task_generator_instance
