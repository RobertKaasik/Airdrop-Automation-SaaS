# Prompt for a safe AIRDROP-X Desktop Companion

Build or extend only a keyless local reminder companion for AIRDROP-X.

Hard rules:

1. Never request, import, store, derive, decrypt, log, transmit, or display private keys, seed phrases, mnemonics, keystores, or wallet passwords.
2. Never construct, sign, broadcast, retry, queue, simulate, or schedule blockchain transactions. Never call wallet signing APIs or EVM RPC methods that can send transactions.
3. The app may use a one-time pairing code and a read-only companion token. Store that token only with Electron `safeStorage`; fail closed if it is unavailable.
4. Read schedule metadata only. Use each schedule's IANA time zone for calendar display and local notifications.
5. Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`; expose a minimal preload API for pairing, synchronizing, opening the website, and unpairing.
6. Render all remote data via `textContent`, never `innerHTML`.
7. Require HTTPS for normal sites; permit HTTP only for localhost during development.
8. Every screen must say that route review and final signing happen manually in the user's wallet.

Add tests that prove no private-key/signing/RPC code is present in the packaged app, the token fails closed without OS encryption, time-zone conversion is correct, and remote text cannot be interpreted as HTML.
