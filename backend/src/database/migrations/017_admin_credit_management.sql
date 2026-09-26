-- 017_admin_credit_management.sql
-- Phase 6: Admin Credit Management Foundation with Immutable Ledger & Multi-User Governance

-- 1. Extend credit_tx_type enum
ALTER TYPE credit_tx_type ADD VALUE IF NOT EXISTS 'PROJECT_CLAIM_REFUND';
ALTER TYPE credit_tx_type ADD VALUE IF NOT EXISTS 'ADMIN_CREDIT_GRANT';
ALTER TYPE credit_tx_type ADD VALUE IF NOT EXISTS 'ADMIN_CREDIT_REMOVAL';
ALTER TYPE credit_tx_type ADD VALUE IF NOT EXISTS 'PAYMENT_REFUND';

-- 2. Enhance credit_accounts
ALTER TABLE credit_accounts ALTER COLUMN developer_id DROP NOT NULL;
ALTER TABLE credit_accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE credit_accounts ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'INR';

-- Backfill user_id on credit_accounts from developers
UPDATE credit_accounts ca
SET user_id = d.user_id
FROM developers d
WHERE ca.developer_id = d.id AND ca.user_id IS NULL;

-- Ensure unique credit_account per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_accounts_user_id ON credit_accounts(user_id) WHERE user_id IS NOT NULL;

-- Ensure all existing developers have a credit_account row
INSERT INTO credit_accounts (user_id, developer_id, balance, currency)
SELECT d.user_id, d.id, 0, 'INR'
FROM developers d
WHERE NOT EXISTS (
  SELECT 1 FROM credit_accounts ca WHERE ca.developer_id = d.id OR (ca.user_id IS NOT NULL AND ca.user_id = d.user_id)
);

-- 3. Enhance credit_transactions (Immutable Ledger)
ALTER TABLE credit_transactions ALTER COLUMN developer_id DROP NOT NULL;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS balance_before INTEGER;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Backfill user_id on credit_transactions from developers
UPDATE credit_transactions ct
SET user_id = d.user_id
FROM developers d
WHERE ct.developer_id = d.id AND ct.user_id IS NULL;

-- Backfill balance_before
UPDATE credit_transactions
SET balance_before = GREATEST(balance_after - amount, 0)
WHERE balance_before IS NULL;

ALTER TABLE credit_transactions ALTER COLUMN balance_before SET DEFAULT 0;
ALTER TABLE credit_transactions ALTER COLUMN balance_before SET NOT NULL;

-- Backfill reason from description
UPDATE credit_transactions
SET reason = description
WHERE reason IS NULL;

-- Performance indexes for administrative ledger & audit queries
CREATE INDEX IF NOT EXISTS idx_credit_tx_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_performed_by ON credit_transactions(performed_by);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created_at ON credit_transactions(created_at DESC);
