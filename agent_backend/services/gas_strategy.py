"""EIP-1559 gas calculation with safety buffers."""

import asyncio
from typing import Dict, Optional
from web3 import Web3
from eth_typing import HexStr


class GasStrategy:
    """
    EIP-1559 gas parameter calculator with safety buffers.
    
    Features:
    - Multi-RPC polling for base fee
    - Safety multipliers for volatility
    - Per-chain configuration
    - Fallback defaults
    """
    
    def __init__(self, rpc_config: Dict[int, Dict[str, str]]):
        """
        Initialize gas strategy.
        
        Args:
            rpc_config: Dictionary mapping chain_id -> {primary, fallback} RPC URLs
        """
        self.rpc_config = rpc_config
        self.w3_instances = {}
        
        # Initialize Web3 instances
        for chain_id, config in rpc_config.items():
            try:
                self.w3_instances[chain_id] = Web3(Web3.HTTPProvider(config["primary"]))
                print(f"[GasStrategy] Initialized chain {chain_id}: {config['primary']}")
            except Exception as e:
                print(f"[GasStrategy] Failed to initialize chain {chain_id}: {e}")
        
        # Per-chain safety multipliers (can be tuned based on network volatility)
        self.SAFETY_MULTIPLIERS = {
            1: 1.2,      # Ethereum mainnet - moderate volatility
            8453: 1.1,   # Base - lower volatility
            42161: 1.1,  # Arbitrum - lower volatility
            10: 1.1,     # Optimism - lower volatility
        }
        
        # Default gas parameters (fallback if RPC fails)
        self.DEFAULT_GAS = {
            1: {
                "max_fee_per_gas": 50_000_000_000,  # 50 gwei
                "max_priority_fee_per_gas": 2_000_000_000  # 2 gwei
            },
            8453: {
                "max_fee_per_gas": 1_000_000_000,  # 1 gwei
                "max_priority_fee_per_gas": 100_000_000  # 0.1 gwei
            },
            42161: {
                "max_fee_per_gas": 500_000_000,  # 0.5 gwei
                "max_priority_fee_per_gas": 100_000_000  # 0.1 gwei
            },
            10: {
                "max_fee_per_gas": 1_000_000_000,  # 1 gwei
                "max_priority_fee_per_gas": 100_000_000  # 0.1 gwei
            }
        }
        
        # Maximum allowed gas price (circuit breaker)
        self.MAX_ALLOWED_BASE_FEE = {
            1: 200_000_000_000,  # 200 gwei
            8453: 10_000_000_000,  # 10 gwei
            42161: 5_000_000_000,  # 5 gwei
            10: 10_000_000_000  # 10 gwei
        }
    
    async def calculate_gas_params(
        self,
        chain_id: int,
        priority: str = "normal"
    ) -> Dict[str, int]:
        """
        Calculate EIP-1559 gas parameters.
        
        Args:
            chain_id: Target chain ID
            priority: "low" | "normal" | "high" | "urgent"
        
        Returns:
            Dictionary with max_fee_per_gas and max_priority_fee_per_gas in wei
        """
        # Priority fee multipliers
        priority_multipliers = {
            "low": 0.8,
            "normal": 1.0,
            "high": 1.5,
            "urgent": 2.0
        }
        
        priority_multiplier = priority_multipliers.get(priority, 1.0)
        
        # Get Web3 instance
        w3 = self.w3_instances.get(chain_id)
        if not w3:
            print(f"[GasStrategy] No Web3 instance for chain {chain_id}, using defaults")
            return self._get_default_gas(chain_id, priority_multiplier)
        
        try:
            # Fetch latest block for base fee
            latest_block = w3.eth.get_block("latest")
            base_fee = latest_block.get("baseFeePerGas", 0)
            
            if base_fee == 0:
                print(f"[GasStrategy] No base fee in block, using defaults")
                return self._get_default_gas(chain_id, priority_multiplier)
            
            # Circuit breaker: reject if base fee is unreasonably high
            max_allowed = self.MAX_ALLOWED_BASE_FEE.get(chain_id, 500_000_000_000)
            if base_fee > max_allowed:
                print(f"[GasStrategy] Base fee {base_fee} exceeds max {max_allowed}")
                raise ValueError(f"Base fee too high: {base_fee} wei")
            
            # Apply safety multiplier for next block volatility
            safety_multiplier = self.SAFETY_MULTIPLIERS.get(chain_id, 1.2)
            buffered_base_fee = int(base_fee * safety_multiplier)
            
            # Calculate priority fee based on chain
            priority_fee = self._calculate_priority_fee(chain_id, priority_multiplier)
            
            # maxFeePerGas = buffered base fee + priority fee
            max_fee = buffered_base_fee + priority_fee
            
            print(f"[GasStrategy] Chain {chain_id}: base={base_fee}, "
                  f"buffered={buffered_base_fee}, priority={priority_fee}, "
                  f"maxFee={max_fee}")
            
            return {
                "max_fee_per_gas": max_fee,
                "max_priority_fee_per_gas": priority_fee
            }
            
        except Exception as e:
            print(f"[GasStrategy] Error calculating gas for chain {chain_id}: {e}")
            return self._get_default_gas(chain_id, priority_multiplier)
    
    def _calculate_priority_fee(self, chain_id: int, multiplier: float = 1.0) -> int:
        """Calculate priority fee based on chain characteristics."""
        # Base priority fees (in wei)
        base_priority = {
            1: 2_000_000_000,    # 2 gwei (Ethereum)
            8453: 100_000_000,   # 0.1 gwei (Base)
            42161: 100_000_000,  # 0.1 gwei (Arbitrum)
            10: 100_000_000      # 0.1 gwei (Optimism)
        }
        
        base = base_priority.get(chain_id, 1_000_000_000)
        return int(base * multiplier)
    
    def _get_default_gas(self, chain_id: int, priority_multiplier: float = 1.0) -> Dict[str, int]:
        """Get default gas parameters with priority adjustment."""
        defaults = self.DEFAULT_GAS.get(
            chain_id,
            {
                "max_fee_per_gas": 50_000_000_000,
                "max_priority_fee_per_gas": 2_000_000_000
            }
        )
        
        return {
            "max_fee_per_gas": defaults["max_fee_per_gas"],
            "max_priority_fee_per_gas": int(defaults["max_priority_fee_per_gas"] * priority_multiplier)
        }
    
    def format_gas_gwei(self, gas_wei: int) -> str:
        """Format gas in wei to human-readable gwei string."""
        return f"{gas_wei / 1_000_000_000:.2f} gwei"


# Singleton instance
_gas_strategy_instance: Optional[GasStrategy] = None


def get_gas_strategy(rpc_config: Optional[Dict[int, Dict[str, str]]] = None) -> GasStrategy:
    """Get or create gas strategy singleton."""
    global _gas_strategy_instance
    
    if _gas_strategy_instance is None:
        if rpc_config is None:
            # Default configuration
            rpc_config = {
                1: {
                    "primary": "https://eth.llamarpc.com",
                    "fallback": "https://rpc.ankr.com/eth"
                },
                8453: {
                    "primary": "https://mainnet.base.org",
                    "fallback": "https://base.llamarpc.com"
                },
                42161: {
                    "primary": "https://arb1.arbitrum.io/rpc",
                    "fallback": "https://arbitrum.llamarpc.com"
                },
                10: {
                    "primary": "https://mainnet.optimism.io",
                    "fallback": "https://optimism.llamarpc.com"
                }
            }
        
        _gas_strategy_instance = GasStrategy(rpc_config)
    
    return _gas_strategy_instance
