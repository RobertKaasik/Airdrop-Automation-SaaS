const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('main.cjs');
const preload = read('preload.cjs');
const renderer = read('renderer/renderer.js');
const packageJson = read('package.json');

for (const source of [main, preload, renderer, packageJson]) {
  for (const forbidden of ['privateKey', 'mnemonic', 'sendTransaction', 'ethers', 'rpc-manager', 'tx-executor']) {
    assert.equal(source.includes(forbidden), false, `Unsafe reference found: ${forbidden}`);
  }
}

assert.equal(main.includes('safeStorage.isEncryptionAvailable()'), true, 'Pairing token must use OS secure storage.');
assert.equal(main.includes('task.timezone'), true, 'Timezone-aware scheduling must remain enabled.');
assert.equal(main.includes('new Notification'), true, 'Local reminders must remain enabled.');
assert.equal(preload.includes("contextBridge.exposeInMainWorld('companion'"), true, 'Only the narrow IPC bridge is exposed.');
assert.equal(renderer.includes('innerHTML'), false, 'Remote schedule data must not be inserted as HTML.');
console.log('Safe Companion checks passed.');
