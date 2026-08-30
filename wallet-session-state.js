(function attachWalletSessionState(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AxWalletSessionState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWalletSessionStateApi() {
    'use strict';

    const VERSION = 1;
    const KEY_PREFIX = 'ax_wallet_session_state_v1';
    const PROVIDER_KINDS = new Set(['metamask', 'walletconnect']);

    function normalizeAddress(value) {
        const address = String(value || '').trim();
        return /^0x[0-9a-fA-F]{40}$/.test(address) ? address : '';
    }

    function normalizeChainId(value) {
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
            return `0x${value.toString(16)}`;
        }
        const input = String(value || '').trim().toLowerCase();
        if (/^0x[0-9a-f]+$/.test(input)) return `0x${BigInt(input).toString(16)}`;
        if (/^\d+$/.test(input)) return `0x${BigInt(input).toString(16)}`;
        return '';
    }

    function uniqueAddresses(values) {
        const result = [];
        const seen = new Set();
        for (const value of Array.isArray(values) ? values : []) {
            const address = normalizeAddress(value);
            if (!address) continue;
            const key = address.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(address);
        }
        return result;
    }

    function storageKey(username) {
        const owner = String(username || '').trim().toLowerCase();
        return `${KEY_PREFIX}:${encodeURIComponent(owner || 'anonymous')}`;
    }

    function emptyState() {
        return {
            version: VERSION,
            activeAddress: '',
            connectedAddress: '',
            providerKind: '',
            chainId: '',
            updatedAt: 0,
        };
    }

    function sanitizeState(value) {
        const input = value && typeof value === 'object' ? value : {};
        const activeAddress = normalizeAddress(input.activeAddress);
        const connectedAddress = normalizeAddress(input.connectedAddress);
        const providerKind = PROVIDER_KINDS.has(input.providerKind) ? input.providerKind : '';
        return {
            version: VERSION,
            activeAddress,
            connectedAddress: providerKind ? connectedAddress : '',
            providerKind,
            chainId: providerKind ? normalizeChainId(input.chainId) : '',
            updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : 0,
        };
    }

    function read(storage, username) {
        if (!storage || typeof storage.getItem !== 'function') return emptyState();
        try {
            return sanitizeState(JSON.parse(storage.getItem(storageKey(username)) || 'null'));
        } catch (_) {
            return emptyState();
        }
    }

    function write(storage, username, nextState) {
        const state = sanitizeState({ ...nextState, updatedAt: Date.now() });
        if (storage && typeof storage.setItem === 'function') {
            storage.setItem(storageKey(username), JSON.stringify(state));
        }
        return state;
    }

    function setActive(storage, username, address) {
        const state = read(storage, username);
        state.activeAddress = normalizeAddress(address);
        if (state.connectedAddress && state.connectedAddress.toLowerCase() !== state.activeAddress.toLowerCase()) {
            state.connectedAddress = '';
        }
        return write(storage, username, state);
    }

    function setConnection(storage, username, { address, providerKind, chainId } = {}) {
        const state = read(storage, username);
        state.connectedAddress = normalizeAddress(address);
        state.providerKind = PROVIDER_KINDS.has(providerKind) ? providerKind : '';
        state.chainId = normalizeChainId(chainId);
        if (!state.providerKind) {
            state.connectedAddress = '';
            state.chainId = '';
        }
        return write(storage, username, state);
    }

    function clearConnection(storage, username) {
        const state = read(storage, username);
        state.connectedAddress = '';
        state.providerKind = '';
        state.chainId = '';
        return write(storage, username, state);
    }

    function resolveAccounts(accounts, activeAddress) {
        const selected = uniqueAddresses(accounts);
        const expected = normalizeAddress(activeAddress);
        if (!expected) return { matches: false, reason: 'missing-active-address', address: '', accounts: selected };
        if (!selected.length) return { matches: false, reason: 'no-account', address: '', accounts: selected };
        const match = selected.find((address) => address.toLowerCase() === expected.toLowerCase()) || '';
        return {
            matches: Boolean(match),
            reason: match ? 'connected' : 'different-account',
            address: match,
            accounts: selected,
        };
    }

    function reconcileSavedAccounts(accounts, activeAddress, savedAddresses) {
        const resolved = resolveAccounts(accounts, activeAddress);
        const expected = normalizeAddress(activeAddress);
        if (!expected) return resolved;
        const saved = new Set(uniqueAddresses(savedAddresses).map((address) => address.toLowerCase()));
        if (!saved.has(expected.toLowerCase())) {
            return { ...resolved, matches: false, reason: 'unsaved-active-address', address: '' };
        }
        return resolved;
    }

    return {
        VERSION,
        KEY_PREFIX,
        normalizeAddress,
        normalizeChainId,
        uniqueAddresses,
        storageKey,
        emptyState,
        sanitizeState,
        read,
        write,
        setActive,
        setConnection,
        clearConnection,
        resolveAccounts,
        reconcileSavedAccounts,
    };
});
