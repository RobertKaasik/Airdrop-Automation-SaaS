# AGENT MODE SECURITY

## Overview

The AIRDROP-X Desktop Companion supports two operational modes:

1. **Safe Mode** (Default) - Keyless reminder system for all tiers
2. **VIP Agent Mode** - Automated transaction signing for Premium VIP+ tiers

## Security Architecture

### Tier-Based Access Control

Agent mode uses **numeric tier levels** for scalable access control:

```
Level 0-2: Safe Mode Only
├── Level 0: Free
├── Level 1: Standard  
└── Level 2: PRO Farmer

Level 3+: Agent Mode Available
├── Level 3: Premium VIP
├── Level 4: VIP Ultimate
├── Level 5: Whale / Syndicate
└── Level 6: Enterprise
```

**Validation happens at multiple layers:**
- Backend pairing endpoint
- Backend task endpoint
- Desktop main process
- UI toggle state

### OS-Native Key Encryption

Agent mode stores private keys using **OS-native encryption only**:

| Operating System | Encryption Method |
|-----------------|-------------------|
| macOS | Keychain |
| Windows | DPAPI (Data Protection API) |
| Linux | Secret Service |

**Fail-Closed Design:**
- If OS encryption unavailable → Fatal error (no fallback)
- Keys never stored in plaintext
- Keys never transmitted over network
- Keys never exposed to renderer process

### Transaction Execution Security

**Nonce Management:**
- Per-address mutex locks prevent concurrent execution
- Nonce cache with 60-second TTL
- RPC fallback on cache miss
- Automatic retry with exponential backoff

**Gas Safety:**
- EIP-1559 with configurable buffers (1.2x-1.5x)
- Multi-RPC redundancy
- Max gas price limits (configurable)

**Payload Validation:**
- Never execute tasks with empty calldata
- Address checksum validation
- Chain ID whitelist
- Execution window enforcement (UTC)

### Network Security

**HTTPS Enforcement:**
- All backend communications require HTTPS
- HTTP only allowed for localhost (development)

**Timing Attack Prevention:**
- Random jitter delays (100-500ms) before broadcast
- Prevents deterministic timing patterns

## Threat Model

### What Agent Mode Protects Against

✅ **Key theft from file system** - OS-native encryption prevents plaintext extraction  
✅ **Nonce collisions** - Mutex locks ensure sequential execution per wallet  
✅ **Timing analysis** - Random jitter prevents pattern detection  
✅ **XSS attacks** - Keys never exposed to renderer, strict CSP  
✅ **MITM attacks** - HTTPS enforced, TLS certificate validation  

### What Agent Mode CANNOT Protect Against

⚠️ **Malicious backend payloads** - Agent executes tasks from trusted server  
⚠️ **Compromised server** - If backend hacked, malicious tasks could be generated  
⚠️ **OS-level malware** - Root/admin malware can bypass OS encryption  
⚠️ **Physical device theft** - OS encryption depends on device being locked  
⚠️ **Social engineering** - User must verify schedules and gas limits  

## Risk Disclosure

**Users enabling Agent Mode accept the following risks:**

1. **Automated Execution** - Transactions execute without manual confirmation
2. **Key Storage** - Private keys stored locally (encrypted but on device)
3. **Server Trust** - You must fully trust the backend server
4. **No Recovery** - Lost or stolen keys cannot be recovered by the app
5. **Gas Costs** - Failed transactions still consume gas
6. **Potential Loss** - Malicious or buggy payloads could drain wallets

## Incident Response

**If keys are compromised:**

1. **Immediate Action:**
   - Disable agent mode immediately
   - Transfer funds from affected wallets to new addresses
   - Revoke all approvals for affected addresses

2. **Investigation:**
   - Check `agent-keys.enc` file permissions (should be 0600)
   - Review recent task execution logs
   - Check for unauthorized transactions

3. **Notification:**
   - Report to AIRDROP-X support
   - Provide task IDs and timestamps
   - Do NOT share private keys or seed phrases

**If backend is compromised:**

1. Backend has global kill switch to disable task generation
2. Desktop agents will receive empty task lists
3. Users will be notified via safe mode UI
4. System will revert to safe mode only

## Best Practices

### For Users

✅ **Review schedules** before enabling agent mode  
✅ **Set gas limits** to prevent excessive costs  
✅ **Use separate wallets** for automated vs manual operations  
✅ **Monitor execution** via dashboard and blockchain explorers  
✅ **Keep OS updated** to maintain encryption security  
❌ **Never share** private keys, seed phrases, or keystore files  
❌ **Never enable** agent mode on shared/public computers  

### For Developers

✅ **Validate all inputs** at backend before generating tasks  
✅ **Test gas calculations** thoroughly before production  
✅ **Monitor telemetry** for anomalies (high failure rates, excessive gas)  
✅ **Rate limit** task generation per user  
✅ **Log all actions** for audit trail  
❌ **Never log** private keys, seed phrases, or plaintext secrets  
❌ **Never disable** tier validation or payload checks  

## Audit Trail

All agent operations are logged for security auditing:

**Desktop Agent Logs:**
- Task fetch attempts
- Execution attempts (success/failure)
- Nonce management operations
- Gas calculations
- RPC interactions

**Backend Logs:**
- Task generation with user/tier
- Telemetry submissions
- Tier validation failures
- Payload validation results

**Database Records:**
- `agent_tasks` - All generated tasks with timestamps
- `task_telemetry` - Execution results with gas usage

## Compliance

**Data Protection:**
- Private keys never leave user's device
- No key backup or recovery service
- User has full control over key deletion

**Regulatory Considerations:**
- Agent mode may be restricted in some jurisdictions
- Users responsible for compliance with local laws
- Service provider does not have access to user keys

## Updates and Versioning

**Security Updates:**
- Critical security patches applied immediately
- Users notified of required updates
- Backward compatibility maintained when possible

**Version History:**
- v0.1.0 - Initial agent mode implementation
- Tier-based access control
- OS-native key encryption
- EIP-1559 gas strategy

## Contact

**Security Issues:**
- Email: security@airdrop-x.com
- Do NOT include private keys or sensitive data in reports

**General Support:**
- Email: support@airdrop-x.com
- Telegram: @airdropx_support

---

**Last Updated:** August 29, 2026  
**Document Version:** 1.0  
**Agent Mode Version:** 0.1.0
