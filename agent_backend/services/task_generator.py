"""Task generation service - converts schedules to executable blockchain transactions."""

import time
import asyncio
import os
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import pytz

# Import from parent server
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import (
    WalletActionSchedule,
    Wallet,
    BASE_CHAIN_ID,
    BASE_USDC_ADDRESS,
    BASE_NATIVE_TOKEN_ADDRESS,
    AAVE_V3_BASE_POOL,
    UNISWAP_TRADE_API_URL,
    LIFI_API_URL,
    LIFI_EVM_NETWORKS,
    LIFI_NATIVE_TOKEN_ADDRESS,
    build_aave_supply_calldata,
    build_aave_withdraw_calldata,
    normalize_token_amount,
    uniswap_headers,
    lifi_headers,
    parse_provider_json_response,
    validate_lifi_transaction_request,
    is_valid_evm_address
)

from ..models import AgentTask, ExecutionWindow
from .gas_strategy import get_gas_strategy

import requests


# Environment configuration
UNISWAP_API_KEY = os.getenv("UNISWAP_API_KEY")
LIFI_API_KEY = os.getenv("LIFI_API_KEY")

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
        Generate DEX swap task using Uniswap API.
        
        Default: ETH -> USDC on Base (0.01 ETH)
        In production, parse amount and tokens from schedule parameters.
        """
        # For demo: 0.01 ETH -> USDC swap
        amount_eth = "0.01"
        
        try:
            # Step 1: Get quote from Uniswap
            quote_payload = {
                "tokenIn": BASE_NATIVE_TOKEN_ADDRESS,
                "tokenOut": BASE_USDC_ADDRESS,
                "tokenInChainId": BASE_CHAIN_ID,
                "tokenOutChainId": BASE_CHAIN_ID,
                "type": "EXACT_INPUT",
                "amount": str(int(float(amount_eth) * 10**18)),  # ETH to wei
                "swapper": wallet.wallet_address,
                "slippageTolerance": "0.5",  # 0.5%
            }
            
            print(f"[TaskGen] Requesting Uniswap quote for {amount_eth} ETH -> USDC")
            
            quote_response = requests.post(
                f"{UNISWAP_TRADE_API_URL}/quote",
                headers=uniswap_headers(),
                json=quote_payload,
                timeout=15,
            )
            
            quote_data = parse_provider_json_response(
                quote_response,
                provider="Uniswap quote",
                unavailable_detail="Uniswap quote unavailable",
                rejected_detail="Unable to get swap quote",
                invalid_detail="Invalid swap quote"
            )
            
            quote = quote_data.get("quote")
            if not quote:
                print(f"[TaskGen] No quote returned from Uniswap")
                return None
            
            # Step 2: Build transaction from quote
            build_payload = {
                "quote": quote,
                "deadline": int(time.time()) + 180,  # 3 minutes
                "refreshGasPrice": True,
                "simulateTransaction": False,  # Skip simulation for agent mode
                "safetyMode": "SAFE",
            }
            
            build_response = requests.post(
                f"{UNISWAP_TRADE_API_URL}/swap",
                headers=uniswap_headers(),
                json=build_payload,
                timeout=15,
            )
            
            swap_data = parse_provider_json_response(
                build_response,
                provider="Uniswap builder",
                unavailable_detail="Uniswap builder unavailable",
                rejected_detail="Unable to build swap transaction",
                invalid_detail="Invalid swap transaction"
            )
            
            # Step 3: Extract transaction details
            swap = swap_data.get("swap")
            if not swap:
                print(f"[TaskGen] No swap transaction returned")
                return None
            
            chain_id = int(swap["chainId"])
            to_address = swap["to"]
            calldata = swap["data"]
            value = str(swap.get("value", "0"))
            
            # Validation
            if (
                chain_id != BASE_CHAIN_ID
                or not is_valid_evm_address(to_address)
                or not calldata
                or not calldata.startswith("0x")
                or len(calldata) <= 2
            ):
                print(f"[TaskGen] Swap transaction validation failed")
                return None
            
            # Step 4: Get gas parameters (override what Uniswap suggests)
            gas_params = await self.gas_strategy.calculate_gas_params(
                chain_id=BASE_CHAIN_ID,
                priority="normal"
            )
            
            # Step 5: Create task
            task = AgentTask(
                task_id=f"swap_{schedule.id}_{int(time.time())}",
                wallet_address=wallet.wallet_address,
                chain_id=BASE_CHAIN_ID,
                to_address=to_address,
                calldata=calldata,
                value_wei=value,
                max_fee_per_gas=str(gas_params["max_fee_per_gas"]),
                max_priority_fee_per_gas=str(gas_params["max_priority_fee_per_gas"]),
                execution_window_start_utc=execution_window.start_utc,
                execution_window_end_utc=execution_window.end_utc,
                action_type="swap",
                description=f"Swap {amount_eth} ETH to USDC on Base via Uniswap"
            )
            
            print(f"[TaskGen] Generated swap task: {task.task_id}")
            return task
            
        except Exception as error:
            print(f"[TaskGen] Error generating swap task: {error}")
            return None
    
    async def _generate_bridge_task(
        self,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow
    ) -> Optional[AgentTask]:
        """
        Generate bridge task using LI.FI API.
        
        Default: 1 USDC from Base -> Arbitrum
        In production, parse networks, token, and amount from schedule parameters.
        """
        # For demo: Bridge 1 USDC from Base to Arbitrum
        amount = "1"
        from_network = "Base"
        to_network = "Arbitrum"
        
        try:
            # Get network configs
            from_config = LIFI_EVM_NETWORKS.get(from_network)
            to_config = LIFI_EVM_NETWORKS.get(to_network)
            
            if not from_config or not to_config:
                print(f"[TaskGen] Invalid networks: {from_network} -> {to_network}")
                return None
            
            # Step 1: Get quote from LI.FI
            # For simplicity, using USDC on both chains
            # In production, token addresses should be fetched from LI.FI token list
            from_token_address = BASE_USDC_ADDRESS
            to_token_address = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"  # USDC on Arbitrum
            
            normalized_amount, amount_atomic = normalize_token_amount(amount, 6)  # USDC decimals
            
            params = {
                "fromChain": str(from_config["chain_id"]),
                "toChain": str(to_config["chain_id"]),
                "fromToken": from_token_address,
                "toToken": to_token_address,
                "fromAmount": amount_atomic,
                "fromAddress": wallet.wallet_address,
                "toAddress": wallet.wallet_address,
                "slippage": "0.005",  # 0.5%
                "order": "CHEAPEST",
            }
            
            print(f"[TaskGen] Requesting LI.FI quote for {amount} USDC {from_network} -> {to_network}")
            
            quote_response = requests.get(
                f"{LIFI_API_URL}/quote",
                params=params,
                headers=lifi_headers(),
                timeout=20,
            )
            
            quote_data = parse_provider_json_response(
                quote_response,
                provider="LI.FI quote",
                unavailable_detail="LI.FI quote unavailable",
                rejected_detail="No bridge route available",
                invalid_detail="Invalid bridge quote",
                rejected_status=422
            )
            
            # Step 2: Extract and validate transaction
            transaction_request = quote_data.get("transactionRequest")
            if not transaction_request:
                print(f"[TaskGen] No transaction request in LI.FI quote")
                return None
            
            # CRITICAL: Check if ERC20 approval is required
            # For automated execution, we only support native token bridges (ETH)
            # or pre-approved ERC20 tokens
            estimate = quote_data.get("estimate", {})
            approval_address = estimate.get("approvalAddress")
            
            if from_token_address != LIFI_NATIVE_TOKEN_ADDRESS:
                # ERC20 bridge - would require approval transaction first
                # For now, skip these (TODO: implement approval handling)
                print(f"[TaskGen] Skipping bridge task - ERC20 approval required")
                print(f"[TaskGen] User must manually approve {approval_address} for {from_token_address}")
                return None
            
            transaction = validate_lifi_transaction_request(
                transaction_request,
                from_config["chain_id"],
                wallet.wallet_address
            )
            
            # Step 3: Get gas parameters (override LI.FI suggestions)
            gas_params = await self.gas_strategy.calculate_gas_params(
                chain_id=from_config["chain_id"],
                priority="normal"
            )
            
            # Step 4: Create task
            task = AgentTask(
                task_id=f"bridge_{schedule.id}_{int(time.time())}",
                wallet_address=wallet.wallet_address,
                chain_id=from_config["chain_id"],
                to_address=transaction["to"],
                calldata=transaction["data"],
                value_wei=transaction["value"],
                max_fee_per_gas=str(gas_params["max_fee_per_gas"]),
                max_priority_fee_per_gas=str(gas_params["max_priority_fee_per_gas"]),
                execution_window_start_utc=execution_window.start_utc,
                execution_window_end_utc=execution_window.end_utc,
                action_type="bridge",
                description=f"Bridge {amount} USDC from {from_network} to {to_network} via LI.FI"
            )
            
            print(f"[TaskGen] Generated bridge task: {task.task_id}")
            return task
            
        except Exception as error:
            print(f"[TaskGen] Error generating bridge task: {error}")
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
