from abc import ABC


class ProtocolAdapterUnavailable(RuntimeError):
    """Raised when an optional protocol client has no live implementation."""


class BaseProtocolAdapter(ABC):
    """Fail-closed base for optional protocol integrations.

    AIRDROP-X must never fabricate a quote, status, or transaction payload.
    Production provider responses are fetched and validated by the backend API.
    """

    provider_name = "unconfigured"

    def _unavailable(self):
        raise ProtocolAdapterUnavailable(
            f"{self.provider_name} direct adapter is not configured; "
            "use the validated production API route"
        )

    def get_supported_chains(self):
        return []

    def get_supported_tokens(self, chain_id):
        return []

    def get_quote(self, params):
        self._unavailable()

    def build_transaction(self, params):
        self._unavailable()

    def validate_quote(self, quote_id, params):
        return False

    def get_transaction_status(self, tx_hash):
        self._unavailable()
