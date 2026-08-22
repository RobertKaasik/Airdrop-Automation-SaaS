"""Read-only eligibility helper.

The old implementation generated fictitious token allocations and exposed
unneeded wallet metadata. AIRDROP-X now treats eligibility as unavailable until
an official project-provided checker is configured.
"""


class AirdropScanner:
    def fetch_user_wallets(self, _username: str) -> list:
        """Wallet retrieval is handled by authenticated API routes in server.py."""
        return []

    def scan_allocations(self, username: str) -> dict:
        return {
            "status": "unavailable",
            "username": username,
            "total_wallets_scanned": 0,
            "found_drops": [],
            "notice_key": "eligibility_integrations_pending",
        }
