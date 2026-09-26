-- ==============================================================================
-- MIGRATION 014: DEVELOPER SUPPORT & EXTENDED PROFILE REQUIREMENTS
-- ==============================================================================

-- 1. Allow support tickets for general platform/account and credit/payment support
ALTER TABLE support_tickets ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE support_tickets ALTER COLUMN client_id DROP NOT NULL;

-- 2. Add extended developer requirements columns to developers table
ALTER TABLE developers ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(500);
ALTER TABLE developers ADD COLUMN IF NOT EXISTS programming_languages TEXT[] DEFAULT '{}';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS frameworks TEXT[] DEFAULT '{}';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS databases TEXT[] DEFAULT '{}';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS cloud_tools TEXT[] DEFAULT '{}';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS aiml_tools TEXT[] DEFAULT '{}';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS uiux_tools TEXT[] DEFAULT '{}';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS other_links TEXT;

-- 3. Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_support_tickets_developer_id ON support_tickets(developer_id);
