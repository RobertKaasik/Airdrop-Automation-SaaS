"""Payload builder service - reuses existing protocol builders."""


class PayloadBuilder:
    """
    Reuses transaction building logic from server.py for:
    - Uniswap (Base swap)
    - LI.FI (bridge)
    - Aave V3 (lending)
    """
    
    async def build_uniswap_payload(
        self,
        from_address: str,
        token_in: str,
        token_out: str,
        amount_in: str,
        slippage: float = 0.5
    ) -> dict:
        """
        Build Uniswap swap transaction payload.
        Reuses logic from server.py lines ~2000-2500.
        """
        # TODO: Import and adapt Uniswap building logic from server.py
        pass
    
    async def build_lifi_payload(
        self,
        from_chain: int,
        to_chain: int,
        from_token: str,
        to_token: str,
        amount: str,
        from_address: str
    ) -> dict:
        """
        Build LI.FI bridge transaction payload.
        Reuses logic from server.py lines ~3000-3500.
        """
        # TODO: Import and adapt LI.FI building logic from server.py
        pass
    
    async def build_aave_payload(
        self,
        action: str,  # "supply" or "withdraw"
        asset: str,
        amount: str,
        from_address: str
    ) -> dict:
        """
        Build Aave V3 transaction payload.
        Reuses logic from server.py lines ~4000-4500.
        """
        # TODO: Import and adapt Aave building logic from server.py
        pass
