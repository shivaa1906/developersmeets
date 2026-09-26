-- ============================================================================
-- NEXUS PLATFORM MIGRATION 006: SUPPORT BRIDGES CONVERSATION LINK & IDENTIFIERS
-- Governance: CEO Ritesh Lingamallu & MD M. Shiva Gopi
-- ============================================================================

ALTER TABLE support_bridges 
ADD COLUMN IF NOT EXISTS bridge_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_bridges_conv ON support_bridges(conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_bridges_number ON support_bridges(bridge_number);
