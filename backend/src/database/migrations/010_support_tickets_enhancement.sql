-- ============================================================================
-- NEXUS PLATFORM MIGRATION 010: SUPPORT TICKETS ENHANCEMENT
-- Governance: CEO M. Shiva Gopi & MD Ritesh Lingamallu
-- ============================================================================

ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'TECHNICAL',
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS internal_notes TEXT,
ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);

