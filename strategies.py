import logging

logger = logging.getLogger("AIRDROP-X-STRATEGY")

class FarmingStrategies:
    """Compatibility helpers for reviewing user-selected actions.

    This module does not randomize behaviour, evade network rules, or execute
    transactions. Every supported action must be requested and signed by the
    wallet owner in the interface.
    """

    AVAILABLE_ACTIONS = ("swap_tokens", "bridge_layer", "add_liquidity")

    @staticmethod
    def generate_random_route(wallet_id: int) -> list:
        """Return an informational checklist; kept for old callers only."""
        logger.info("[Strategy] Read-only checklist requested for wallet #%s", wallet_id)
        return list(FarmingStrategies.AVAILABLE_ACTIONS)

    @staticmethod
    async def execute_action(action_name: str, wallet_id: int):
        """Never execute an action: the user's wallet is the only signer."""
        logger.info("[Strategy] Action %s needs owner confirmation for wallet #%s", action_name, wallet_id)
        return {"status": "requires_wallet_confirmation", "action": action_name}
