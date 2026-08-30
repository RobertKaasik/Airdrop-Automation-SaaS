const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('main.cjs');
const preload = read('preload.cjs');
const renderer = read('renderer/renderer.js');
const packageJson = read('package.json');

// Renderer must stay keyless / XSS-safe (no signing primitives in UI process)
for (const forbidden of ['privateKey', 'mnemonic', 'sendTransaction', 'ethers', 'rpc-manager', 'tx-executor']) {
  assert.equal(renderer.includes(forbidden), false, `Unsafe renderer reference: ${forbidden}`);
}

// Preload must not expose raw key material APIs beyond the narrow bridge names
assert.equal(preload.includes('privateKey'), false, 'Preload must not mention privateKey');
assert.equal(preload.includes('sendTransaction'), false, 'Preload must not expose sendTransaction');

assert.equal(main.includes('safeStorage.isEncryptionAvailable()'), true, 'Pairing token must use OS secure storage.');
assert.equal(main.includes('task.timezone'), true, 'Timezone-aware scheduling must remain enabled.');
assert.equal(main.includes('new Notification'), true, 'Local reminders must remain enabled.');
assert.equal(main.includes('/api/companion/agent/tasks'), true, 'Agent poller must use dedicated executable-task endpoint.');
assert.equal(preload.includes("contextBridge.exposeInMainWorld('companion'"), true, 'Only the narrow IPC bridge is exposed.');
assert.equal(renderer.includes('innerHTML'), false, 'Remote schedule data must not be inserted as HTML.');
assert.equal(main.includes('normalizeSubscription'), true, 'Sync must map tier_name into the plan card.');
assert.equal(packageJson.includes('"ethers"'), true, 'ethers.js required for agent signing in main process.');
console.log('Safe Companion checks passed.');
