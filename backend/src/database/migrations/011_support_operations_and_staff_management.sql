-- 011_support_operations_and_staff_management.sql
-- Enterprise Support Operations, Staff Management, Teams, Routing & Escalation Schema

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_staff_status') THEN
    CREATE TYPE support_staff_status AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE', 'SUSPENDED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_level') THEN
    CREATE TYPE support_level AS ENUM ('L1_SUPPORT', 'L2_SUPPORT', 'TECHNICAL_SUPPORT', 'SUPPORT_LEAD', 'SUPPORT_MANAGER');
  END IF;
END $$;

-- Support Categories Configuration
CREATE TABLE IF NOT EXISTS support_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sla_hours_urgent INT DEFAULT 2,
  sla_hours_high INT DEFAULT 8,
  sla_hours_normal INT DEFAULT 24,
  sla_hours_low INT DEFAULT 48,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed default categories if empty
INSERT INTO support_categories (key, label, description, sla_hours_urgent, sla_hours_high, sla_hours_normal, sla_hours_low)
VALUES
  ('TECHNICAL', 'Technical & Codebase', 'Software bugs, codebase defects, or architectural issues', 2, 8, 24, 48),
  ('BUG', 'Defect / Bug Report', 'Functional bugs and unexpected runtime errors in delivered software', 2, 6, 24, 48),
  ('DEPLOYMENT', 'Deployment & Hosting', 'CI/CD pipelines, container failures, DNS, and cloud environments', 2, 8, 24, 48),
  ('PAYMENTS', 'Payments & Invoicing', 'Payment processing, failed transactions, and fee settlements', 4, 12, 24, 48),
  ('BILLING', 'Billing & Escrow', 'Milestone escrow releases, payout queries, and financial reconciliation', 4, 12, 24, 48),
  ('CREDITS', 'Platform Credits', 'Developer credit purchases, claim deductions, and auto-refunds', 4, 12, 24, 48),
  ('PROJECT', 'Project Scoping & Delivery', 'Milestone queries, deliverable disputes, and timeline mediation', 6, 16, 36, 72),
  ('ACCOUNT', 'Account & Security', 'Authentication, account lockouts, 2FA, and identity verification', 2, 8, 24, 48),
  ('SECURITY', 'Security Vulnerability', 'Confidential vulnerability reports and threat disclosures', 1, 4, 12, 24),
  ('COMMUNITY', 'Developer Community', 'Forum conduct, channel moderation, and developer guild policies', 8, 24, 48, 96),
  ('OTHER', 'General Inquiry', 'Miscellaneous inquiries and platform assistance', 8, 24, 48, 96)
ON CONFLICT (key) DO NOTHING;

-- Support Staff Profiles
CREATE TABLE IF NOT EXISTS support_staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department VARCHAR(100) NOT NULL DEFAULT 'Technical Support',
  title VARCHAR(100) NOT NULL DEFAULT 'Support Specialist',
  support_level support_level NOT NULL DEFAULT 'L1_SUPPORT',
  specializations JSONB NOT NULL DEFAULT '["Web", "Technical"]'::jsonb,
  status support_staff_status NOT NULL DEFAULT 'AVAILABLE',
  availability VARCHAR(100) DEFAULT 'Standard shifts (9 AM - 6 PM UTC)',
  max_active_tickets INT NOT NULL DEFAULT 10,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  permissions JSONB NOT NULL DEFAULT '["SUPPORT_VIEW_TICKETS", "SUPPORT_REPLY_TICKETS", "SUPPORT_CHANGE_STATUS", "SUPPORT_CHANGE_PRIORITY", "SUPPORT_CREATE_BRIDGE", "SUPPORT_ADD_DEVELOPER", "SUPPORT_VIEW_INTERNAL_NOTES", "SUPPORT_ADD_INTERNAL_NOTES", "SUPPORT_RESOLVE_TICKETS", "SUPPORT_CLOSE_TICKETS", "SUPPORT_ESCALATE_TICKETS"]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Support Teams Structure
CREATE TABLE IF NOT EXISTS support_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  department VARCHAR(100) NOT NULL DEFAULT 'Customer Operations',
  description TEXT,
  lead_staff_id UUID REFERENCES support_staff(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Support Team Memberships
CREATE TABLE IF NOT EXISTS support_team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES support_teams(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES support_staff(id) ON DELETE CASCADE,
  role_in_team VARCHAR(50) DEFAULT 'MEMBER',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, staff_id)
);

-- Support Escalations History
CREATE TABLE IF NOT EXISTS support_escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  escalated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  new_assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  escalation_level VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Additional Columns on support_tickets for Enterprise SLA & Routing
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES support_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
  ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMP WITH TIME ZONE;

-- Seed Default Teams
INSERT INTO support_teams (name, department, description)
VALUES
  ('Technical Support', 'Engineering', 'Frontend, backend, database, and infrastructure assistance'),
  ('Billing & Operations', 'Finance', 'Invoicing, escrow payouts, and developer credit assistance'),
  ('Executive Escalations', 'Operations', 'Critical client disputes and high-urgency incidents')
ON CONFLICT (name) DO NOTHING;

-- Indexes for high performance querying
CREATE INDEX IF NOT EXISTS idx_support_staff_user ON support_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_support_staff_status ON support_staff(status);
CREATE INDEX IF NOT EXISTS idx_support_staff_level ON support_staff(support_level);
CREATE INDEX IF NOT EXISTS idx_support_team_members_team ON support_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_support_team_members_staff ON support_team_members(staff_id);
CREATE INDEX IF NOT EXISTS idx_support_escalations_ticket ON support_escalations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_team ON support_tickets(team_id);
