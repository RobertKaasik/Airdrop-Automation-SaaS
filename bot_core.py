"""Retired transaction-signer compatibility module.

This project is non-custodial: it never accepts private keys, loads them from
files, or broadcasts transactions on a user's behalf. Transaction requests are
prepared by the web app and signed explicitly in the connected wallet.
"""


class NonCustodialSigningRequired(RuntimeError):
    """Raised when legacy code attempts to sign a transaction on the server."""


def _signing_removed(*_args, **_kwargs):
    raise NonCustodialSigningRequired(
        "Server-side signing has been removed. Confirm the action in your own wallet."
    )


# Kept only to make old local scripts fail safely and with a clear explanation.
process_single_wallet = _signing_removed
run_farming_session = _signing_removed
load_wallets_from_file = _signing_removed
run_single_wallet_from_server = _signing_removed
