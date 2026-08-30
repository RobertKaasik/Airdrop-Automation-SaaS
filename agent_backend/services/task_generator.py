"""Task generation service - converts schedules to executable blockchain transactions."""

import time
import asyncio
import os
import re
import json
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
from .schedule_compat import (
    WEEKDAY_MAP,
    ACTION_DEX,
    ACTION_BRIDGE,
    ACTION_LENDING,
    ACTION_LENDING_WITHDRAW,
    normalize_action_type,
    protocol_for_action,
)

import requests


# Environment configuration
UNISWAP_API_KEY = os.getenv("UNISWAP_API_KEY")
LIFI_API_KEY = os.getenv("LIFI_API_KEY")
WINDOW_MINUTES = 30


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
                
                # Generate task(s) based on action type
                generated = await self._generate_task_for_schedule(
                    schedule,
                    wallet,
                    execution_window
                )
                
                if not generated:
                    continue
                if isinstance(generated, list):
                    tasks.extend(generated)
                else:
                    tasks.append(generated)
            
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

        Supports fixed / custom / flexible modes used by the website.
        Weekdays follow Python datetime.weekday() (Mon=0 ... Sun=6).
        """
        now_utc = datetime.now(pytz.UTC)
        try:
            schedule_tz = pytz.timezone(schedule.timezone or "UTC")
        except Exception:
            schedule_tz = pytz.UTC

        now_local = now_utc.astimezone(schedule_tz)
        mode = (schedule.schedule_mode or "fixed").lower()

        if mode == "custom":
            slots = self._parse_json_list(schedule.custom_slots)
            for item in slots:
                day = item.get("day") or item.get("day_of_week")
                time_text = item.get("time") or item.get("time_of_day")
                target_local = self._next_weekly_local(now_local, day, time_text)
                window = self._window_if_due(target_local, now_utc, schedule.timezone)
                if window:
                    return window
            return None

        if mode == "flexible":
            slots = self._parse_json_list(schedule.generated_slots)
            for item in slots:
                target_local = self._slot_datetime_local(item, schedule_tz)
                if not target_local:
                    continue
                window = self._window_if_due(target_local, now_utc, schedule.timezone)
                if window:
                    return window
            return None

        target_local = self._next_weekly_local(
            now_local, schedule.day_of_week, schedule.time_of_day
        )
        return self._window_if_due(target_local, now_utc, schedule.timezone)

    def _parse_json_list(self, raw) -> list:
        if not raw:
            return []
        if isinstance(raw, list):
            return raw
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            return []
        return parsed if isinstance(parsed, list) else []

    def _next_weekly_local(self, now_local: datetime, day_code: Optional[str], time_text: Optional[str]) -> Optional[datetime]:
        target_weekday = WEEKDAY_MAP.get(str(day_code or "").strip())
        if target_weekday is None:
            print(f"[TaskGen] Invalid day_of_week: {day_code}")
            return None
        try:
            hour, minute = map(int, str(time_text).split(":"))
        except Exception:
            print(f"[TaskGen] Invalid time_of_day: {time_text}")
            return None

        days_ahead = (target_weekday - now_local.weekday()) % 7
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if days_ahead == 0 and candidate < now_local:
            days_ahead = 7
        if days_ahead:
            candidate = (now_local + timedelta(days=days_ahead)).replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )
        return candidate

    def _slot_datetime_local(self, item: dict, schedule_tz) -> Optional[datetime]:
        date_string = item.get("date")
        time_text = item.get("time") or item.get("time_of_day")
        if not date_string or not time_text:
            return None
        try:
            hour, minute = map(int, str(time_text).split(":"))
            year, month, day = map(int, str(date_string).split("-"))
            naive = datetime(year, month, day, hour, minute, 0, 0)
            return schedule_tz.localize(naive)
        except Exception as error:
            print(f"[TaskGen] Invalid flexible slot {item}: {error}")
            return None

    def _window_if_due(
        self,
        target_local: Optional[datetime],
        now_utc: datetime,
        timezone_name: Optional[str],
    ) -> Optional[ExecutionWindow]:
        if not target_local:
            return None
        target_utc = target_local.astimezone(pytz.UTC)
        window_start = target_utc - timedelta(minutes=WINDOW_MINUTES)
        window_end = target_utc + timedelta(minutes=WINDOW_MINUTES)
        if not (window_start <= now_utc <= window_end):
            return None
        return ExecutionWindow(
            start_utc=int(window_start.timestamp()),
            end_utc=int(window_end.timestamp()),
            timezone=timezone_name or "UTC",
        )

    def _make_agent_task(
        self,
        *,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow,
        chain_id: int,
        to_address: str,
        calldata: str,
        value_wei: str,
        gas_params: dict,
        canonical_action: str,
        task_prefix: str,
    ) -> AgentTask:
        return AgentTask(
            task_id=f"{task_prefix}_{schedule.id}_{int(time.time())}",
            wallet_id=int(schedule.wallet_id),
            schedule_id=schedule.id,
            chain_id=int(chain_id),
            to_address=to_address,
            calldata=calldata,
            value_wei=str(value_wei or "0"),
            max_fee_per_gas=str(gas_params["max_fee_per_gas"]),
            max_priority_fee_per_gas=str(gas_params["max_priority_fee_per_gas"]),
            execution_window_start_utc=execution_window.start_utc,
            execution_window_end_utc=execution_window.end_utc,
            protocol=protocol_for_action(canonical_action),
            wallet_address=wallet.wallet_address,
        )

    async def _generate_task_for_schedule(
        self,
        schedule: WalletActionSchedule,
        wallet: Wallet,
        execution_window: ExecutionWindow
    ) -> Optional[AgentTask]:
        """Generate specific task based on website action types (dex/bridge/lending)."""
        action_type = normalize_action_type(schedule.action_type)

        if action_type == ACTION_DEX:
            return await self._generate_swap_task(schedule, wallet, execution_window)

        if action_type == ACTION_BRIDGE:
            return await self._generate_bridge_task(schedule, wallet, execution_window)

        if action_type == ACTION_LENDING:
            return await self._generate_aave_supply_task(schedule, wallet, execution_window)

        if action_type == ACTION_LENDING_WITHDRAW:
            return await self._generate_aave_withdraw_task(schedule, wallet, execution_window)

        print(f"[TaskGen] Unsupported action type: {schedule.action_type}")
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
            task = self._make_agent_task(
                schedule=schedule,
                wallet=wallet,
                execution_window=execution_window,
                chain_id=BASE_CHAIN_ID,
                to_address=to_address,
                calldata=calldata,
                value_wei=value,
                gas_params=gas_params,
                canonical_action=ACTION_DEX,
                task_prefix="swap",
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

        Default: native ETH Base -> Arbitrum (no ERC-20 approval).
        ERC-20 routes are skipped unless the quote is native-in.
        """
        # Small native amount for low-fee L2 testing
        amount_eth = "0.0001"
        from_network = "Base"
        to_network = "Arbitrum"
        
        try:
            # Get network configs
            from_config = LIFI_EVM_NETWORKS.get(from_network)
            to_config = LIFI_EVM_NETWORKS.get(to_network)
            
            if not from_config or not to_config:
                print(f"[TaskGen] Invalid networks: {from_network} -> {to_network}")
                return None
            
            # Native ETH on both sides — avoids a required ERC-20 approval tx
            from_token_address = LIFI_NATIVE_TOKEN_ADDRESS
            to_token_address = LIFI_NATIVE_TOKEN_ADDRESS

            normalized_amount, amount_atomic = normalize_token_amount(amount_eth, 18)

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

            print(f"[TaskGen] Requesting LI.FI quote for {amount_eth} ETH {from_network} -> {to_network}")
            
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
            
            # Native-in only: ERC-20 would need a separate approval transaction
            estimate = quote_data.get("estimate", {})
            approval_address = estimate.get("approvalAddress")
            from_token = str(from_token_address).lower()
            native = str(LIFI_NATIVE_TOKEN_ADDRESS).lower()
            if from_token != native:
                print(f"[TaskGen] Skipping ERC-20 bridge (approval {approval_address})")
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
            task = self._make_agent_task(
                schedule=schedule,
                wallet=wallet,
                execution_window=execution_window,
                chain_id=from_config["chain_id"],
                to_address=transaction["to"],
                calldata=transaction["data"],
                value_wei=transaction["value"],
                gas_params=gas_params,
                canonical_action=ACTION_BRIDGE,
                task_prefix="bridge",
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
            task = self._make_agent_task(
                schedule=schedule,
                wallet=wallet,
                execution_window=execution_window,
                chain_id=BASE_CHAIN_ID,
                to_address=AAVE_V3_BASE_POOL,
                calldata=calldata,
                value_wei="0",
                gas_params=gas_params,
                canonical_action=ACTION_LENDING,
                task_prefix="aave_supply",
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
            task = self._make_agent_task(
                schedule=schedule,
                wallet=wallet,
                execution_window=execution_window,
                chain_id=BASE_CHAIN_ID,
                to_address=AAVE_V3_BASE_POOL,
                calldata=calldata,
                value_wei="0",
                gas_params=gas_params,
                canonical_action=ACTION_LENDING_WITHDRAW,
                task_prefix="aave_withdraw",
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
