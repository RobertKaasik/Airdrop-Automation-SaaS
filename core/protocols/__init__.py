"""Legacy adapter namespace.

Execution uses the validated provider-specific services in ``server.py``.  The
old generic adapters are deliberately not registered because they cannot build
transactions without live provider responses.
"""

BRIDGES_ADAPTERS = {}
LENDING_ADAPTERS = {}
DEX_ADAPTERS = {}
