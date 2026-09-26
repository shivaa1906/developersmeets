-- Migration: 016_support_ticket_ownership.sql
-- Description: Add created_by_user_id to support_tickets and enforce login-based ticket ownership

-- 1. Add created_by_user_id column to support_tickets
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Backfill created_by_user_id for existing tickets from client or developer accounts
-- 2a. From clients table
UPDATE support_tickets st
SET created_by_user_id = c.user_id
FROM clients c
WHERE st.client_id = c.id AND st.created_by_user_id IS NULL;

-- 2b. From developers table
UPDATE support_tickets st
SET created_by_user_id = d.user_id
FROM developers d
WHERE st.developer_id = d.id AND st.created_by_user_id IS NULL;

-- 2c. Fallback to assigned agent or platform admin if still null
UPDATE support_tickets st
SET created_by_user_id = COALESCE(st.assigned_to_user_id, (SELECT id FROM users WHERE role IN ('ADMIN', 'CEO') LIMIT 1))
WHERE st.created_by_user_id IS NULL;

-- 3. Create indexes for high-speed ownership checks and IDOR prevention
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON support_tickets(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_client ON support_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_developer ON support_tickets(developer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to_user_id);
