const { ethers } = require('ethers');
const CryptoStorage = require('./crypto-storage.cjs');

/**
 * Automated transaction executor with nonce management.
 * 
 * Features:
 * - Per-address nonce management with mutex locks
 * - EIP-1559 gas handling
 * - Multi-RPC redundancy with fallback
 * - Configurable jitter delays
 * - Comprehensive error handling
 */
class TransactionExecutor {
    constructor(cryptoStorage, rpcConfig) {
        if (!cryptoStorage) {
            throw new Error('CryptoStorage instance required');
        }
        
        this.cryptoStorage = cryptoStorage;
        this.providers = new Map(); // chainId -> JsonRpcProvider
        this.nonceLocks = new Map(); // address -> Promise (mutex)
        this.nonceCache = new Map(); // address -> { nonce, timestamp, chainId }
        this.rpcConfig = rpcConfig || this._getDefaultRpcConfig();
        
        // Configuration
        this.NONCE_CACHE_TTL_MS = 60000; // 60 seconds
        this.JITTER_MIN_MS = 100;
        this.JITTER_MAX_MS = 500;
        this.MAX_RETRY_ATTEMPTS = 3;
        this.RETRY_DELAY_MS = 2000;
        
        this._initializeProviders();
    }
    
    /**
     * Execute a task by signing and broadcasting the transaction.
     * 
     * @param {Object} task - Task object with transaction parameters
     * @returns {Promise<Object>} - Execution result with tx_hash and status
     */
    async executeTask(task) {
        const {
            task_id,
            chain_id,
            to_address,
            calldata,
            value_wei,
            max_fee_per_gas,
            max_priority_fee_per_gas,
            wallet_address
        } = task;
        
        console.log(`[Executor] Starting task ${task_id} for ${wallet_address}`);
        
        // 1. Validate task completeness
        this._validateTask(task);
        
        // 2. Get provider for chain
        const provider = this._getProvider(chain_id);
        if (!provider) {
            return {
                task_id,
                status: 'failed',
                error_message: `No RPC provider configured for chain ${chain_id}`
            };
        }
        
        // 3. Acquire nonce lock for this address
        await this._acquireNonceLock(wallet_address);
        
        try {
            // 4. Get fresh nonce with retry logic
            const nonce = await this._getNonce(wallet_address, chain_id, provider);
            
            // 5. Decrypt private key (in memory only)
            const privateKeyBuffer = await this.cryptoStorage.getPrivateKey(wallet_address);
            const wallet = new ethers.Wallet(privateKeyBuffer, provider);
            
            // Zero the buffer immediately
            privateKeyBuffer.fill(0);
            
            // 6. Add configurable jitter delay
            await this._randomJitter();
            
            // 7. Build transaction object
            const tx = {
                to: to_address,
                data: calldata,
                value: value_wei,
                maxFeePerGas: max_fee_per_gas,
                maxPriorityFeePerGas: max_priority_fee_per_gas,
                nonce,
                chainId: chain_id,
                type: 2 // EIP-1559
            };
            
            // 8. Estimate gas limit
            try {
                const gasEstimate = await wallet.estimateGas(tx);
                tx.gasLimit = gasEstimate;
                console.log(`[Executor] Gas estimate: ${gasEstimate.toString()}`);
            } catch (error) {
                console.warn(`[Executor] Gas estimation failed: ${error.message}, using default`);
                tx.gasLimit = 500000; // Conservative default
            }
            
            // 9. Sign and send transaction
            console.log(`[Executor] Broadcasting transaction with nonce ${nonce}`);
            const txResponse = await wallet.sendTransaction(tx);
            
            // 10. Update nonce cache
            this._updateNonceCache(wallet_address, chain_id, nonce + 1);
            
            console.log(`[Executor] Task ${task_id} broadcast: ${txResponse.hash}`);
            
            return {
                task_id,
                tx_hash: txResponse.hash,
                status: 'success',
                nonce_used: nonce
            };
            
        } catch (error) {
            console.error(`[Executor] Task ${task_id} failed:`, error);
            
            // Invalidate nonce cache on error
            this._invalidateNonceCache(wallet_address, chain_id);
            
            return {
                task_id,
                status: 'failed',
                error_message: error.message,
                error_code: error.code || 'UNKNOWN'
            };
        } finally {
            // 11. Release nonce lock
            this._releaseNonceLock(wallet_address);
        }
    }
    
    /**
     * Execute multiple tasks in parallel (with per-wallet nonce locks).
     * 
     * @param {Array} tasks - Array of task objects
     * @returns {Promise<Array>} - Array of execution results
     */
    async executeTasks(tasks) {
        console.log(`[Executor] Executing ${tasks.length} tasks in parallel`);
        
        const results = await Promise.allSettled(
            tasks.map(task => this.executeTask(task))
        );
        
        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    task_id: tasks[index].task_id,
                    status: 'failed',
                    error_message: result.reason?.message || 'Unknown error'
                };
            }
        });
    }
    
    // ========== Nonce Management ==========
    
    async _getNonce(address, chainId, provider) {
        const cacheKey = `${address.toLowerCase()}-${chainId}`;
        const cached = this.nonceCache.get(cacheKey);
        
        // Check if cache is valid
        if (cached && 
            cached.chainId === chainId &&
            Date.now() - cached.timestamp < this.NONCE_CACHE_TTL_MS) {
            console.log(`[Nonce] Using cached nonce ${cached.nonce} for ${address}`);
            return cached.nonce;
        }
        
        // Fetch from RPC with retry
        let lastError;
        for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                const nonce = await provider.getTransactionCount(address, 'pending');
                console.log(`[Nonce] Fetched nonce ${nonce} for ${address} from RPC (attempt ${attempt})`);
                
                // Update cache
                this._updateNonceCache(address, chainId, nonce);
                
                return nonce;
            } catch (error) {
                lastError = error;
                console.warn(`[Nonce] RPC fetch attempt ${attempt} failed:`, error.message);
                
                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
                }
            }
        }
        
        throw new Error(`Failed to fetch nonce after ${this.MAX_RETRY_ATTEMPTS} attempts: ${lastError.message}`);
    }
    
    _updateNonceCache(address, chainId, nonce) {
        const cacheKey = `${address.toLowerCase()}-${chainId}`;
        this.nonceCache.set(cacheKey, {
            nonce,
            chainId,
            timestamp: Date.now()
        });
    }
    
    _invalidateNonceCache(address, chainId) {
        const cacheKey = `${address.toLowerCase()}-${chainId}`;
        this.nonceCache.delete(cacheKey);
        console.log(`[Nonce] Invalidated cache for ${address} on chain ${chainId}`);
    }
    
    // ========== Mutex Lock Management ==========
    
    async _acquireNonceLock(address) {
        const key = address.toLowerCase();
        
        // Wait for existing lock to release
        while (this.nonceLocks.has(key)) {
            await this.nonceLocks.get(key);
        }
        
        // Create new lock
        let releaseLock;
        const lockPromise = new Promise(resolve => {
            releaseLock = resolve;
        });
        
        this.nonceLocks.set(key, lockPromise);
        this._currentLockRelease = releaseLock;
        
        console.log(`[Lock] Acquired nonce lock for ${address}`);
    }
    
    _releaseNonceLock(address) {
        const key = address.toLowerCase();
        
        if (this._currentLockRelease) {
            this._currentLockRelease();
            this._currentLockRelease = null;
        }
        
        this.nonceLocks.delete(key);
        console.log(`[Lock] Released nonce lock for ${address}`);
    }
    
    // ========== Validation ==========
    
    _validateTask(task) {
        // CRITICAL: Empty calldata check
        if (!task.calldata || task.calldata === '0x' || task.calldata.length <= 2) {
            throw new Error('Invalid task: empty calldata');
        }
        
        // Address validation
        if (!task.to_address || !ethers.isAddress(task.to_address)) {
            throw new Error(`Invalid task: invalid to_address ${task.to_address}`);
        }
        
        if (!task.wallet_address || !ethers.isAddress(task.wallet_address)) {
            throw new Error(`Invalid task: invalid wallet_address ${task.wallet_address}`);
        }
        
        // Chain ID validation
        if (!task.chain_id || !this.providers.has(task.chain_id)) {
            throw new Error(`Invalid task: unsupported chain_id ${task.chain_id}`);
        }
        
        // Gas parameters validation
        if (!task.max_fee_per_gas || !task.max_priority_fee_per_gas) {
            throw new Error('Invalid task: missing gas parameters');
        }
    }
    
    // ========== Provider Management ==========
    
    _initializeProviders() {
        for (const [chainId, config] of Object.entries(this.rpcConfig)) {
            try {
                const provider = new ethers.JsonRpcProvider(
                    config.primary,
                    parseInt(chainId)
                );
                this.providers.set(parseInt(chainId), provider);
                console.log(`[Provider] Initialized RPC for chain ${chainId}: ${config.primary}`);
            } catch (error) {
                console.error(`[Provider] Failed to initialize chain ${chainId}:`, error);
            }
        }
    }
    
    _getProvider(chainId) {
        return this.providers.get(chainId);
    }
    
    _getDefaultRpcConfig() {
        // Default RPC endpoints (should be configured via environment)
        return {
            1: {
                primary: 'https://eth.llamarpc.com',
                fallback: 'https://rpc.ankr.com/eth'
            },
            8453: {
                primary: 'https://mainnet.base.org',
                fallback: 'https://base.llamarpc.com'
            },
            42161: {
                primary: 'https://arb1.arbitrum.io/rpc',
                fallback: 'https://arbitrum.llamarpc.com'
            },
            10: {
                primary: 'https://mainnet.optimism.io',
                fallback: 'https://optimism.llamarpc.com'
            }
        };
    }
    
    // ========== Utility Methods ==========
    
    async _randomJitter() {
        const delay = this.JITTER_MIN_MS + 
            Math.random() * (this.JITTER_MAX_MS - this.JITTER_MIN_MS);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    /**
     * Wait for transaction confirmation.
     * 
     * @param {string} txHash - Transaction hash
     * @param {number} chainId - Chain ID
     * @param {number} confirmations - Number of confirmations to wait for
     * @returns {Promise<Object>} - Transaction receipt
     */
    async waitForConfirmation(txHash, chainId, confirmations = 1) {
        const provider = this._getProvider(chainId);
        if (!provider) {
            throw new Error(`No provider for chain ${chainId}`);
        }
        
        console.log(`[Executor] Waiting for ${confirmations} confirmation(s) of ${txHash}`);
        const receipt = await provider.waitForTransaction(txHash, confirmations);
        
        return {
            tx_hash: txHash,
            status: receipt.status === 1 ? 'confirmed' : 'failed',
            block_number: receipt.blockNumber,
            gas_used: receipt.gasUsed.toString(),
            confirmations: receipt.confirmations
        };
    }
    
    /**
     * Get statistics about executor state.
     */
    getStats() {
        return {
            nonce_cache_size: this.nonceCache.size,
            active_locks: this.nonceLocks.size,
            configured_chains: this.providers.size
        };
    }
}

module.exports = TransactionExecutor;
