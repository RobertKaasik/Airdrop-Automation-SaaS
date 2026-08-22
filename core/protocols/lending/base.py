from core.protocols.base import BaseProtocolAdapter


class BaseLendingAdapter(BaseProtocolAdapter):
    """Marker for optional lending provider clients."""

    def get_market_data(self, params):
        self._unavailable()

    def get_wallet_positions(self, params):
        self._unavailable()

    def build_supply_transaction(self, params):
        self._unavailable()

    def build_withdraw_transaction(self, params):
        self._unavailable()
