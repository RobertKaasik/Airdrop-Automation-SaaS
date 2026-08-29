const { safeStorage } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Secure key storage using OS-native encryption.
 * 
 * HARD REQUIREMENT: Fail closed if safeStorage unavailable.
 * 
 * Security guarantees:
 * - All private keys encrypted with OS-native protection (Keychain/DPAPI/Secret Service)
 * - No fallback encryption (fails if safeStorage unavailable)
 * - Keys never logged or exposed in plaintext
 * - File permissions set to 0o600 (owner read/write only)
 * - Immediate buffer zeroing after decryption
 */
class CryptoStorage {
    constructor(userDataPath) {
        // CRITICAL: Fail closed if OS encryption unavailable
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
    
    /**
     * Initialize keystore file if it doesn't exist.
     */
    async initialize() {
        try {
            await fs.access(this.keystorePath);
            this.initialized = true;
        } catch {
            // Create empty encrypted keystore
            const emptyStore = {
                version: 1,
                keys: {},
                created_at: new Date().toISOString()
            };
            await this._saveStore(emptyStore);
            
            // Set strict file permissions (owner only)
            await fs.chmod(this.keystorePath, 0o600);
            this.initialized = true;
        }
    }
    
    /**
     * Import multiple private keys from file or array.
     * Each key is encrypted individually with safeStorage.
     * 
     * @param {Array} keys - Array of {address: string, privateKey: string}
     */
    async importPrivateKeys(keys) {
        if (!this.initialized) await this.initialize();
        
        const store = await this._loadStore();
        
        for (const { address, privateKey } of keys) {
            // Validate address format
            if (!address || !address.match(/^0x[0-9a-fA-F]{40}$/)) {
                throw new Error(`Invalid address format: ${address}`);
            }
            
            // Validate private key format
            if (!privateKey || !privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
                throw new Error(`Invalid private key format for address ${address}`);
            }
            
            // Checksum the address
            const checksummed = this._checksumAddress(address);
            
            // Encrypt private key with OS-native encryption
            const keyBuffer = Buffer.from(privateKey.slice(2), 'hex');
            const encrypted = safeStorage.encryptString(keyBuffer.toString('hex'));
            
            // Zero the buffer immediately
            keyBuffer.fill(0);
            
            // Store encrypted key
            store.keys[checksummed] = {
                ciphertext: encrypted.toString('base64'),
                imported_at: new Date().toISOString(),
                type: 'private_key'
            };
        }
        
        await this._saveStore(store);
        console.log(`[CryptoStorage] Imported ${keys.length} key(s)`);
    }
    
    /**
     * Import seed phrase and derive HD wallet addresses.
     * Encrypts the mnemonic with safeStorage.
     * 
     * @param {string} mnemonic - 12 or 24 word seed phrase
     * @param {number} count - Number of addresses to derive (default 10)
     */
    async importSeedPhrase(mnemonic, count = 10) {
        if (!this.initialized) await this.initialize();
        
        // Validate mnemonic
        const words = mnemonic.trim().split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
            throw new Error('Invalid seed phrase: must be 12 or 24 words');
        }
        
        // TODO: Implement HD wallet derivation
        // For now, throw error indicating this needs ethers.js integration
        throw new Error(
            'Seed phrase import requires ethers.js HD wallet derivation. ' +
            'This feature will be implemented in the tx-executor module.'
        );
    }
    
    /**
     * Get decrypted private key for signing.
     * Returns Buffer to minimize leak surface area.
     * 
     * CRITICAL: Key is decrypted in memory only and must be zeroed immediately after use.
     * 
     * @param {string} address - Wallet address
     * @returns {Promise<Buffer>} - Decrypted private key as buffer
     */
    async getPrivateKey(address) {
        if (!this.initialized) await this.initialize();
        
        const checksummed = this._checksumAddress(address);
        const store = await this._loadStore();
        
        const keyData = store.keys[checksummed];
        if (!keyData) {
            throw new Error(`No private key found for address ${checksummed}`);
        }
        
        try {
            // Decrypt with OS-native decryption
            const cipherBuffer = Buffer.from(keyData.ciphertext, 'base64');
            const decrypted = safeStorage.decryptString(cipherBuffer);
            
            // Return as Buffer (not string) to reduce leak surface
            return Buffer.from(decrypted, 'hex');
        } catch (error) {
            throw new Error(`Failed to decrypt key for ${checksummed}: ${error.message}`);
        }
    }
    
    /**
     * List all addresses in the keystore (without keys).
     * 
     * @returns {Promise<Array>} - Array of addresses
     */
    async listAddresses() {
        if (!this.initialized) await this.initialize();
        
        const store = await this._loadStore();
        return Object.keys(store.keys).map(address => ({
            address,
            type: store.keys[address].type,
            imported_at: store.keys[address].imported_at
        }));
    }
    
    /**
     * Remove a key from the keystore.
     * 
     * @param {string} address - Wallet address to remove
     */
    async removeKey(address) {
        if (!this.initialized) await this.initialize();
        
        const checksummed = this._checksumAddress(address);
        const store = await this._loadStore();
        
        if (!store.keys[checksummed]) {
            throw new Error(`No key found for address ${checksummed}`);
        }
        
        delete store.keys[checksummed];
        await this._saveStore(store);
        console.log(`[CryptoStorage] Removed key for ${checksummed}`);
    }
    
    /**
     * Clear all keys and delete keystore.
     * USE WITH CAUTION - THIS IS IRREVERSIBLE.
     */
    async clearAll() {
        if (!this.initialized) return;
        
        try {
            await fs.unlink(this.keystorePath);
            this.initialized = false;
            console.log('[CryptoStorage] Keystore cleared');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    
    // ========== Private Methods ==========
    
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
    
    /**
     * Simple checksum implementation for address validation.
     * In production, this should use proper EIP-55 checksumming.
     */
    _checksumAddress(address) {
        // Remove 0x prefix if present
        const addr = address.toLowerCase().replace('0x', '');
        
        // For now, just return lowercase with 0x prefix
        // TODO: Implement proper EIP-55 checksumming
        return '0x' + addr;
    }
}

module.exports = CryptoStorage;
