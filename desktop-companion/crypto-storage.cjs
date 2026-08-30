const { safeStorage } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { Wallet, HDNodeWallet, Mnemonic, getAddress } = require('ethers');

/**
 * Secure key storage using OS-native encryption.
 *
 * HARD REQUIREMENT: Fail closed if safeStorage unavailable.
 */
class CryptoStorage {
    constructor(userDataPath) {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error(
                'FATAL: OS encryption unavailable. ' +
                'Cannot store keys securely. Halting. ' +
                'Ensure your OS supports native encryption (macOS Keychain, Windows DPAPI, or Linux Secret Service).'
            );
        }

        this.keystorePath = path.join(userDataPath, 'agent-keys.enc');
        this.initialized = false;
    }

    async initialize() {
        try {
            await fs.access(this.keystorePath);
            this.initialized = true;
        } catch {
            const emptyStore = {
                version: 1,
                keys: {},
                created_at: new Date().toISOString()
            };
            await this._saveStore(emptyStore);
            await fs.chmod(this.keystorePath, 0o600).catch(() => {});
            this.initialized = true;
        }
    }

    /**
     * Import private keys.
     * Accepts hex strings ("0x…") or objects { address, privateKey }.
     * @returns {{ count: number, addresses: string[] }}
     */
    async importPrivateKeys(keys) {
        if (!this.initialized) await this.initialize();

        if (!Array.isArray(keys) || keys.length === 0) {
            throw new Error('No private keys provided');
        }

        const store = await this._loadStore();
        const imported = [];

        for (const entry of keys) {
            let privateKey;
            let address;

            if (typeof entry === 'string') {
                privateKey = this._normalizePrivateKey(entry);
                address = new Wallet(privateKey).address;
            } else if (entry && typeof entry === 'object') {
                privateKey = this._normalizePrivateKey(entry.privateKey || entry.key || '');
                const wallet = new Wallet(privateKey);
                address = entry.address ? getAddress(entry.address) : wallet.address;
                if (getAddress(wallet.address) !== getAddress(address)) {
                    throw new Error(`Address mismatch for key ending …${privateKey.slice(-6)}`);
                }
            } else {
                throw new Error('Invalid private key entry');
            }

            const checksummed = getAddress(address);
            const keyBuffer = Buffer.from(privateKey.slice(2), 'hex');
            const encrypted = safeStorage.encryptString(keyBuffer.toString('hex'));
            keyBuffer.fill(0);

            store.keys[checksummed] = {
                ciphertext: encrypted.toString('base64'),
                imported_at: new Date().toISOString(),
                type: 'private_key'
            };
            imported.push(checksummed);
        }

        await this._saveStore(store);
        console.log(`[CryptoStorage] Imported ${imported.length} key(s)`);
        return { count: imported.length, addresses: imported };
    }

    /**
     * Import seed phrase and derive first N HD wallets (m/44'/60'/0'/0/i).
     * @returns {{ count: number, addresses: string[] }}
     */
    async importSeedPhrase(mnemonic, count = 10) {
        if (!this.initialized) await this.initialize();

        const phrase = String(mnemonic || '').trim().replace(/\s+/g, ' ');
        const words = phrase.split(' ');
        if (words.length !== 12 && words.length !== 24) {
            throw new Error('Invalid seed phrase: must be 12 or 24 words');
        }

        let mnemonicObj;
        try {
            mnemonicObj = Mnemonic.fromPhrase(phrase);
            // Validate early; HDNodeWallet.fromPhrase uses the same phrase
            void mnemonicObj.phrase;
        } catch (error) {
            throw new Error(`Invalid seed phrase: ${error.message}`);
        }

        const store = await this._loadStore();
        const imported = [];
        const deriveCount = Math.min(Math.max(Number(count) || 10, 1), 50);

        for (let i = 0; i < deriveCount; i += 1) {
            const derivationPath = `m/44'/60'/0'/0/${i}`;
            const wallet = HDNodeWallet.fromPhrase(phrase, undefined, derivationPath);
            const checksummed = getAddress(wallet.address);
            const keyBuffer = Buffer.from(wallet.privateKey.slice(2), 'hex');
            const encrypted = safeStorage.encryptString(keyBuffer.toString('hex'));
            keyBuffer.fill(0);

            store.keys[checksummed] = {
                ciphertext: encrypted.toString('base64'),
                imported_at: new Date().toISOString(),
                type: 'hd_derived',
                derivation_path: derivationPath
            };
            imported.push(checksummed);
        }

        await this._saveStore(store);
        console.log(`[CryptoStorage] Imported seed phrase → ${imported.length} wallet(s)`);
        return { count: imported.length, addresses: imported };
    }

    async getPrivateKey(address) {
        if (!this.initialized) await this.initialize();

        const checksummed = getAddress(address);
        const store = await this._loadStore();
        const keyData = store.keys[checksummed];
        if (!keyData) {
            throw new Error(`No private key found for address ${checksummed}`);
        }

        try {
            const cipherBuffer = Buffer.from(keyData.ciphertext, 'base64');
            const decrypted = safeStorage.decryptString(cipherBuffer);
            return Buffer.from(decrypted, 'hex');
        } catch (error) {
            throw new Error(`Failed to decrypt key for ${checksummed}: ${error.message}`);
        }
    }

    async listAddresses() {
        if (!this.initialized) await this.initialize();
        const store = await this._loadStore();
        return Object.keys(store.keys).map((address) => ({
            address,
            type: store.keys[address].type,
            imported_at: store.keys[address].imported_at
        }));
    }

    async removeKey(address) {
        if (!this.initialized) await this.initialize();
        const checksummed = getAddress(address);
        const store = await this._loadStore();
        if (!store.keys[checksummed]) {
            throw new Error(`No key found for address ${checksummed}`);
        }
        delete store.keys[checksummed];
        await this._saveStore(store);
        console.log(`[CryptoStorage] Removed key for ${checksummed}`);
    }

    async clearAll() {
        if (!this.initialized) return;
        try {
            await fs.unlink(this.keystorePath);
            this.initialized = false;
            console.log('[CryptoStorage] Keystore cleared');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }

    async _loadStore() {
        try {
            const data = await fs.readFile(this.keystorePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to load keystore: ${error.message}`);
        }
    }

    async _saveStore(store) {
        try {
            await fs.writeFile(
                this.keystorePath,
                JSON.stringify(store, null, 2),
                { encoding: 'utf8', mode: 0o600 }
            );
        } catch (error) {
            throw new Error(`Failed to save keystore: ${error.message}`);
        }
    }

    _normalizePrivateKey(raw) {
        let key = String(raw || '').trim();
        if (!key) throw new Error('Empty private key');
        if (!key.startsWith('0x')) key = `0x${key}`;
        if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
            throw new Error('Invalid private key format (expected 64 hex chars)');
        }
        return key;
    }
}

module.exports = CryptoStorage;
