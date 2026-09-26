-- Migration: 018_admin_bulk_credit_operations.sql
-- Description: Schema support for administrative bulk credit grants, audits, and batch tracking

-- 1. Create table for administrative bulk credit operations
CREATE TABLE IF NOT EXISTS credit_bulk_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id VARCHAR(50) UNIQUE NOT NULL,
    performed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_scope VARCHAR(50) NOT NULL, -- 'ALL', 'ALL_DEVELOPERS', 'ALL_CLIENTS', 'SELECTED', 'FILTERED'
    amount_per_user INTEGER NOT NULL CHECK (amount_per_user > 0),
    recipient_count INTEGER NOT NULL DEFAULT 0,
    total_credits BIGINT NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    filters JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_credit_bulk_ops_performed_by ON credit_bulk_operations(performed_by);
CREATE INDEX IF NOT EXISTS idx_credit_bulk_ops_status ON credit_bulk_operations(status);
CREATE INDEX IF NOT EXISTS idx_credit_bulk_ops_created_at ON credit_bulk_operations(created_at DESC);

-- 2. Add bulk_operation_id foreign key to credit_transactions
ALTER TABLE credit_transactions 
ADD COLUMN IF NOT EXISTS bulk_operation_id UUID REFERENCES credit_bulk_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_tx_bulk_op_id ON credit_transactions(bulk_operation_id);
