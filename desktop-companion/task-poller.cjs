const TransactionExecutor = require('./tx-executor.cjs');

/**
 * Task polling service for automated agent mode.
 * 
 * Polls backend for pending tasks and coordinates execution.
 */
class TaskPoller {
    constructor(executor, apiClient, config = {}) {
        this.executor = executor;
        this.apiClient = apiClient;
        this.pollInterval = config.pollInterval || 30000; // 30 seconds default
        this.isPolling = false;
        this.pollTimer = null;
        this.executionMode = 'safe'; // 'safe' or 'agent'
    }
    
    /**
     * Start polling for tasks.
     * Only works in agent mode.
     */
    async startPolling() {
        if (this.executionMode !== 'agent') {
            console.log('[TaskPoller] Not in agent mode, polling disabled');
            return;
        }
        
        if (this.isPolling) {
            console.log('[TaskPoller] Already polling');
            return;
        }
        
        this.isPolling = true;
        console.log(`[TaskPoller] Started polling every ${this.pollInterval}ms`);
        
        // Initial poll
        await this._poll();
        
        // Schedule recurring polls
        this.pollTimer = setInterval(() => this._poll(), this.pollInterval);
    }
    
    /**
     * Stop polling for tasks.
     */
    stopPolling() {
        if (!this.isPolling) {
            return;
        }
        
        this.isPolling = false;
        
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        
        console.log('[TaskPoller] Stopped polling');
    }
    
    /**
     * Set execution mode.
     * 
     * @param {string} mode - 'safe' or 'agent'
     */
    setMode(mode) {
        this.executionMode = mode;
        console.log(`[TaskPoller] Mode set to: ${mode}`);
        
        if (mode === 'safe' && this.isPolling) {
            this.stopPolling();
        }
    }
    
    /**
     * Single poll cycle.
     * @private
     */
    async _poll() {
        try {
            console.log('[TaskPoller] Fetching tasks...');
            
            // 1. Fetch pending tasks from backend
            const response = await this.apiClient.getTasks();
            
            if (!response || !response.tasks) {
                console.log('[TaskPoller] No tasks in response');
                return;
            }
            
            const allTasks = response.tasks;
            console.log(`[TaskPoller] Received ${allTasks.length} tasks`);
            
            if (allTasks.length === 0) {
                return;
            }
            
            // 2. Filter by execution window (UTC)
            const now = Math.floor(Date.now() / 1000);
            const executableTasks = allTasks.filter(task => {
                const inWindow = now >= task.execution_window_start_utc &&
                               now <= task.execution_window_end_utc;
                
                if (!inWindow) {
                    const timeToStart = task.execution_window_start_utc - now;
                    const timeToEnd = task.execution_window_end_utc - now;
                    
                    if (timeToStart > 0) {
                        console.log(`[TaskPoller] Task ${task.task_id} not ready (starts in ${timeToStart}s)`);
                    } else if (timeToEnd < 0) {
                        console.log(`[TaskPoller] Task ${task.task_id} expired (${-timeToEnd}s ago)`);
                    }
                }
                
                return inWindow;
            });
            
            console.log(`[TaskPoller] ${executableTasks.length} tasks ready for execution`);
            
            if (executableTasks.length === 0) {
                return;
            }
            
            // 3. Execute tasks in parallel (with per-wallet nonce locks)
            const results = await this.executor.executeTasks(executableTasks);
            
            // 4. Submit telemetry for each result
            const telemetryPromises = results.map(result => {
                const telemetry = {
                    task_id: result.task_id,
                    tx_hash: result.tx_hash || null,
                    status: result.status,
                    gas_used: result.gas_used || null,
                    error_message: result.error_message || null,
                    executed_at_utc: Math.floor(Date.now() / 1000)
                };
                
                return this.apiClient.submitTelemetry(telemetry)
                    .catch(error => {
                        console.error(`[TaskPoller] Failed to submit telemetry for ${result.task_id}:`, error);
                    });
            });
            
            await Promise.allSettled(telemetryPromises);
            
            // 5. Log summary
            const successCount = results.filter(r => r.status === 'success').length;
            const failureCount = results.filter(r => r.status === 'failed').length;
            console.log(`[TaskPoller] Execution complete: ${successCount} success, ${failureCount} failed`);
            
        } catch (error) {
            console.error('[TaskPoller] Poll error:', error);
            
            // If authentication error, stop polling
            if (error.status === 401 || error.status === 403) {
                console.error('[TaskPoller] Authentication error, stopping polling');
                this.stopPolling();
            }
        }
    }
    
    /**
     * Get polling statistics.
     */
    getStats() {
        return {
            is_polling: this.isPolling,
            poll_interval_ms: this.pollInterval,
            execution_mode: this.executionMode
        };
    }
}

module.exports = TaskPoller;
