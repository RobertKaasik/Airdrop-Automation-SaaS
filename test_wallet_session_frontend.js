'use strict';

const assert = require('node:assert/strict');
const walletState = require('./wallet-session-state.js');

const ADDRESS_A = '0x1111111111111111111111111111111111111111';
const ADDRESS_B = '0x2222222222222222222222222222222222222222';

class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

class MockProvider {
    constructor(accounts = [], chainId = '0x2105') {
        this.accounts = accounts;
        this.chainId = chainId;
        this.listeners = new Map();
    }
    on(event, callback) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.push(callback);
        this.listeners.set(event, callbacks);
    }
    emit(event, value) {
        for (const callback of this.listeners.get(event) || []) callback(value);
    }
    async request({ method }) {
        if (method === 'eth_accounts') return this.accounts;
        if (method === 'eth_chainId') return this.chainId;
        throw new Error(`Unexpected mock method: ${method}`);
    }
}

function testPersistenceIsScopedAndSanitized() {
    const storage = new MemoryStorage();
    walletState.setActive(storage, 'Alice', ADDRESS_A);
    walletState.setConnection(storage, 'Alice', {
        address: ADDRESS_A.toUpperCase().replace('0X', '0x'),
        providerKind: 'walletconnect',
        chainId: 8453,
    });

    const alice = walletState.read(storage, 'Alice');
    const bob = walletState.read(storage, 'Bob');
    assert.equal(alice.activeAddress.toLowerCase(), ADDRESS_A);
    assert.equal(alice.connectedAddress.toLowerCase(), ADDRESS_A);
    assert.equal(alice.providerKind, 'walletconnect');
    assert.equal(alice.chainId, '0x2105');
    assert.equal(bob.activeAddress, '');
    assert.equal(bob.providerKind, '');

    storage.setItem(walletState.storageKey('Mallory'), JSON.stringify({
        activeAddress: 'javascript:alert(1)', connectedAddress: ADDRESS_A, providerKind: 'unknown', chainId: 'bad',
    }));
    assert.deepEqual(walletState.read(storage, 'Mallory'), walletState.emptyState());
}

function testActiveSelectionAndProviderHintAreSeparate() {
    const storage = new MemoryStorage();
    walletState.setActive(storage, 'Alice', ADDRESS_A);
    walletState.setConnection(storage, 'Alice', { address: ADDRESS_A, providerKind: 'metamask', chainId: '0x2105' });
    walletState.setActive(storage, 'Alice', ADDRESS_B);
    const changed = walletState.read(storage, 'Alice');
    assert.equal(changed.activeAddress, ADDRESS_B);
    assert.equal(changed.connectedAddress, '', 'switching active wallet must invalidate a different connected address');
    assert.equal(changed.providerKind, 'metamask', 'provider kind is retained so the UI can explain the mismatch');

    walletState.setConnection(storage, 'Alice', { address: '', providerKind: 'walletconnect', chainId: '0xa4b1' });
    const hintOnly = walletState.read(storage, 'Alice');
    assert.equal(hintOnly.connectedAddress, '');
    assert.equal(hintOnly.providerKind, 'walletconnect');
    assert.equal(hintOnly.chainId, '0xa4b1');
}

function testUnsavedAccountNeverBecomesActive() {
    const noActive = walletState.reconcileSavedAccounts([ADDRESS_B], '', [ADDRESS_A]);
    assert.equal(noActive.matches, false);
    assert.equal(noActive.reason, 'missing-active-address');
    assert.equal(noActive.address, '');

    const unsavedActive = walletState.reconcileSavedAccounts([ADDRESS_B], ADDRESS_B, [ADDRESS_A]);
    assert.equal(unsavedActive.matches, false);
    assert.equal(unsavedActive.reason, 'unsaved-active-address');
    assert.equal(unsavedActive.address, '');

    const savedMatch = walletState.reconcileSavedAccounts([ADDRESS_B, ADDRESS_A], ADDRESS_A, [ADDRESS_A]);
    assert.equal(savedMatch.matches, true);
    assert.equal(savedMatch.address, ADDRESS_A);
}

async function testMockProviderEventsDriveSafeTransitions() {
    const storage = new MemoryStorage();
    const provider = new MockProvider([ADDRESS_A]);
    walletState.setActive(storage, 'Alice', ADDRESS_A);
    const saved = [ADDRESS_A];

    provider.on('accountsChanged', (accounts) => {
        const decision = walletState.reconcileSavedAccounts(accounts, walletState.read(storage, 'Alice').activeAddress, saved);
        if (decision.matches) {
            walletState.setConnection(storage, 'Alice', {
                address: decision.address, providerKind: 'walletconnect', chainId: provider.chainId,
            });
        } else {
            walletState.setConnection(storage, 'Alice', {
                address: '', providerKind: 'walletconnect', chainId: provider.chainId,
            });
        }
    });
    provider.on('chainChanged', (chainId) => {
        const state = walletState.read(storage, 'Alice');
        walletState.setConnection(storage, 'Alice', {
            address: state.connectedAddress, providerKind: 'walletconnect', chainId,
        });
    });
    provider.on('disconnect', () => walletState.clearConnection(storage, 'Alice'));

    provider.emit('accountsChanged', [ADDRESS_A]);
    assert.equal(walletState.read(storage, 'Alice').connectedAddress, ADDRESS_A);

    provider.emit('accountsChanged', [ADDRESS_B]);
    assert.equal(walletState.read(storage, 'Alice').connectedAddress, '', 'mismatched account must be disconnected');
    assert.equal(walletState.read(storage, 'Alice').activeAddress, ADDRESS_A, 'provider events must not replace the selected saved wallet');

    provider.emit('accountsChanged', [ADDRESS_A]);
    provider.emit('chainChanged', '42161');
    assert.equal(walletState.read(storage, 'Alice').chainId, '0xa4b1');

    provider.emit('disconnect');
    assert.equal(walletState.read(storage, 'Alice').connectedAddress, '');
    assert.equal(walletState.read(storage, 'Alice').providerKind, '');
    assert.equal(walletState.read(storage, 'Alice').activeAddress, ADDRESS_A);
}

function testAppWiresBothProviderLifecycles() {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
    for (const expected of [
        "provider.on('accountsChanged'",
        "provider.on('chainChanged'",
        "provider.on('disconnect'",
        "reconcileWalletProviderAccounts('metamask'",
        "reconcileWalletProviderAccounts('walletconnect'",
        'initializeWalletSessionLifecycle()',
    ]) {
        assert.ok(source.includes(expected), `app.js must wire ${expected}`);
    }
    assert.ok(!/accounts\[0\][\s\S]{0,160}setConnectedBaseWalletAddress\(/.test(source), 'the first provider account must not be trusted directly');
}

(async () => {
    testPersistenceIsScopedAndSanitized();
    testActiveSelectionAndProviderHintAreSeparate();
    testUnsavedAccountNeverBecomesActive();
    await testMockProviderEventsDriveSafeTransitions();
    testAppWiresBothProviderLifecycles();
    console.log('wallet session frontend tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
