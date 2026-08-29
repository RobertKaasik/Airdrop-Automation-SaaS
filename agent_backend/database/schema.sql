-- Database schema for automated agent tasks and telemetry

-- Agent tasks table
CREATE TABLE IF NOT EXISTS agent_tasks (
    task_id UUID PRIMARY KEY,
    wallet_id INTEGER NOT NULL,
    schedule_id INTEGER,
    chain_id INTEGER NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    calldata TEXT NOT NULL,
    value_wei NUMERIC(78, 0) DEFAULT 0,
    max_fee_per_gas NUMERIC(78, 0) NOT NULL,
    max_priority_fee_per_gas NUMERIC(78, 0) NOT NULL,
    execution_window_start TIMESTAMP NOT NULL,
    execution_window_end TIMESTAMP NOT NULL,
    protocol VARCHAR(50) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints for data validation
    CONSTRAINT valid_calldata CHECK (LENGTH(calldata) > 2),
    CONSTRAINT valid_to_address CHECK (to_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT valid_wallet_address CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT valid_execution_window CHECK (execution_window_end > execution_window_start)
);

-- Task telemetry table
CREATE TABLE IF NOT EXISTS task_telemetry (
    id SERIAL PRIMARY KEY,
    task_id UUID REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
    tx_hash VARCHAR(66),
    status VARCHAR(20) NOT NULL,
    gas_used INTEGER,
    error_message TEXT,
    executed_at TIMESTAMP NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_telemetry_status CHECK (status IN ('success', 'failed', 'rejected')),
    CONSTRAINT valid_tx_hash CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[0-9a-fA-F]{64}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_pending 
ON agent_tasks(status, execution_window_start) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_wallet 
ON agent_tasks(wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_schedule 
ON agent_tasks(schedule_id) 
WHERE schedule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telemetry_task 
ON task_telemetry(task_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_status 
ON task_telemetry(status, executed_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_agent_tasks_updated_at
BEFORE UPDATE ON agent_tasks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE agent_tasks IS 'Stores automated agent execution tasks with validated payloads';
COMMENT ON TABLE task_telemetry IS 'Records execution results and metrics from desktop agents';
COMMENT ON COLUMN agent_tasks.calldata IS 'Validated transaction calldata (must not be empty)';
COMMENT ON COLUMN agent_tasks.execution_window_start IS 'UTC timestamp when task becomes executable';
COMMENT ON COLUMN agent_tasks.execution_window_end IS 'UTC timestamp when task execution window closes';
COMMENT ON COLUMN task_telemetry.gas_used IS 'Actual gas consumed by successful transaction';
