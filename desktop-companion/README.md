# AIRDROP-X Desktop Companion

Desktop Companion provides two operational modes for different subscription tiers:

## Safe Mode (Default - All Tiers)

Safe Mode is a keyless local reminder application. It pairs with an AIRDROP-X account using a short-lived one-time code, reads schedule metadata, converts every reminder using its configured IANA time zone, and shows a local notification at the planned time.

**Security guarantees:**
- Never asks for, stores, or transmits private keys or seed phrases
- Never constructs, broadcasts, or queues blockchain transactions
- User reviews routes and confirms actions manually in their wallet
- Only the companion token is retained (encrypted with OS `safeStorage`)

**Available to:** Free, Standard, and PRO Farmer tiers

## VIP Agent Mode (Premium VIP+ Only)

VIP Agent Mode enables fully automated transaction signing and broadcasting for premium users.

**Features:**
- Automated transaction execution based on schedules
- Local private key storage with OS-native encryption
- EIP-1559 gas optimization with safety buffers
- Nonce management to prevent collisions
- Multi-wallet support

**Security:**
- Private keys encrypted using OS-native encryption (Keychain/DPAPI/Secret Service)
- Fail-closed design (no fallback encryption)
- Keys never transmitted over network
- Execution validated at multiple layers
- Full audit trail with telemetry

**Available to:** Premium VIP (Level 3+), VIP Ultimate, Whale/Syndicate, Enterprise tiers

⚠️ **Risk Warning:** Agent mode executes transactions automatically. You must fully trust the backend server and accept responsibility for all automated actions. See [AGENT_MODE_SECURITY.md](./AGENT_MODE_SECURITY.md) for complete risk disclosure.

## Installation

```bash
npm install
```

## Running

### Development
```bash
npm start
```

### Production Build
```bash
npm run package:win  # Windows
```

## Setup

### 1. Pairing (Both Modes)

1. Open AIRDROP-X website
2. Navigate to **Settings → Desktop Companion**
3. Click **Create pairing code**
4. Enter the code in the Desktop Companion app within 5 minutes

After pairing, the app will show your subscription tier and available features.

### 2. Safe Mode (Default)

Safe Mode is active immediately after pairing. The app will:
- Sync your schedules
- Show local notifications at scheduled times
- Open the website when you click notifications
- Allow manual review and signing in your wallet

### 3. VIP Agent Mode (Premium Only)

If you have Premium VIP or higher subscription:

1. **Review Security Documentation**  
   Read [AGENT_MODE_SECURITY.md](./AGENT_MODE_SECURITY.md) completely

2. **Enable Agent Mode**  
   - Toggle "Automated Agent Mode" in the dashboard
   - Read and accept the risk disclosure
   - Confirm you understand the security implications

3. **Import Wallet Keys**  
   Choose one of two methods:
   
   **Option A: Import from File**
   - Prepare a `.txt` or `.csv` file
   - One private key per line (format: `0x...`)
   - Click "Import from File" and select your file
   - Keys will be encrypted with OS-native protection
   
   **Option B: Import Seed Phrase**
   - Have your 12 or 24-word seed phrase ready
   - Click "Import Seed Phrase"
   - Enter seed phrase and number of addresses to derive
   - Seed phrase will be encrypted (not stored in plaintext)

4. **Verify Setup**
   - Check that your wallet addresses are listed
   - Confirm schedules are synced
   - Monitor the first few executions carefully

## File Structure

```
desktop-companion/
├── main.cjs                    # Electron main process
├── preload.cjs                 # IPC bridge (sandboxed)
├── crypto-storage.cjs          # Secure key storage (VIP mode only)
├── tx-executor.cjs             # Transaction executor (VIP mode only)
├── renderer/
│   ├── index.html              # UI
│   ├── renderer.js             # UI logic
│   └── style.css               # Styling
├── tests/
│   └── test-safe-companion.cjs # Security validation tests
├── COPILOT_SAFE_PROMPT.md      # Safe mode design principles
├── AGENT_MODE_SECURITY.md      # VIP mode security documentation
└── README.md                   # This file
```

## Security

### Safe Mode
- Uses only OS-encrypted companion token
- No access to wallet keys
- Zero transaction capabilities
- Open source and auditable

### VIP Agent Mode
- OS-native key encryption (Keychain/DPAPI/Secret Service)
- Fail-closed design (no fallback)
- Keys never leave your device
- Full execution audit trail
- Multi-layer tier validation

**See [AGENT_MODE_SECURITY.md](./AGENT_MODE_SECURITY.md) for complete security documentation.**

## Testing

Run security validation tests:

```bash
npm test
```

Tests verify:
- No private key handling in safe mode
- OS encryption fail-closed behavior
- Time zone conversion accuracy
- No HTML injection vulnerabilities

## Upgrading Subscription Tier

If you upgrade your subscription tier:
1. Restart the Desktop Companion
2. Re-pair with a new pairing code
3. The app will automatically detect your new tier
4. VIP Agent Mode toggle will unlock if you're now Premium VIP+

## Troubleshooting

### Agent Mode Toggle is Locked

**Cause:** Your subscription tier doesn't support agent mode  
**Solution:** Upgrade to Premium VIP or higher tier

### OS Encryption Unavailable Error

**Cause:** Your OS doesn't support native encryption or it's disabled  
**Solutions:**
- **macOS:** Ensure Keychain is enabled
- **Windows:** DPAPI should work on all Windows 10/11 systems
- **Linux:** Install and configure Secret Service (gnome-keyring or KWallet)

### Keys Won't Import

**Cause:** Invalid key format  
**Solution:** Ensure private keys are 64 hex characters (0x prefix optional)

### Transactions Not Executing

**Possible causes:**
1. Execution window passed - check schedule timing
2. Insufficient gas - increase gas limits
3. RPC node issues - will retry automatically
4. Nonce collision - agent handles this automatically

Check the telemetry logs for detailed error messages.

## Development

### Running Tests

```bash
npm test
```

### Debugging

Enable Electron DevTools in `main.cjs`:
```javascript
window.webContents.openDevTools();
```

### Linting

The app must pass security linting before packaging:
- No private key handling in safe mode code
- No HTML injection vectors
- Proper OS encryption usage

## Support

- **General:** support@airdrop-x.com
- **Security Issues:** security@airdrop-x.com (DO NOT include private keys)
- **Telegram:** @airdropx_support

## License

Proprietary - AIRDROP-X © 2026

## Changelog

### v0.1.0 (Current)
- Safe mode: Keyless reminder system
- VIP Agent mode: Automated transaction signing
- Tier-based access control (numeric levels)
- OS-native key encryption
- EIP-1559 gas strategy
- Nonce management
- Multi-wallet support
