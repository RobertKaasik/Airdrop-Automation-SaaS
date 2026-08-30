"""Payload builder service - thin wrappers used by TaskGenerator."""

from typing import Optional


class PayloadBuilder:
    """
    Thin facade kept for modularity. Real calldata generation lives in
    TaskGenerator (Uniswap / LI.FI / Aave) to avoid duplicate network calls.
    """

    async def build_uniswap_payload(
        self,
        from_address: str,
        token_in: str,
        token_out: str,
        amount_in: str,
        slippage: float = 0.5,
    ) -> Optional[dict]:
        raise NotImplementedError(
            "Use TaskGenerator._generate_swap_task — Uniswap Trade API integration lives there."
        )

    async def build_lifi_payload(
        self,
        from_chain: int,
        to_chain: int,
        from_token: str,
        to_token: str,
        amount: str,
        from_address: str,
    ) -> Optional[dict]:
        raise NotImplementedError(
            "Use TaskGenerator._generate_bridge_task — LI.FI integration lives there."
        )

    async def build_aave_payload(
        self,
        action: str,
        asset: str,
        amount: str,
        from_address: str,
    ) -> Optional[dict]:
        raise NotImplementedError(
            "Use TaskGenerator Aave helpers — supply/withdraw calldata is built inline."
        )
