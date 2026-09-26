-- 012_multi_role_auth_foundation.sql
-- Multi-Role Authentication Foundation: CLIENT, DEVELOPER, SUPPORT, MD, ADMIN/CEO

-- 1. Ensure 'DISABLED' status exists in user_status enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
    WHERE pg_type.typname = 'user_status' AND pg_enum.enumlabel = 'DISABLED'
  ) THEN
    ALTER TYPE user_status ADD VALUE 'DISABLED';
  END IF;
END $$;

-- 2. Add authentication, verification, and audit columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_uid VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP WITH TIME ZONE;

-- 3. Set default for public_uid and backfill existing users
ALTER TABLE users ALTER COLUMN public_uid SET DEFAULT ('usr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16));

UPDATE users 
SET public_uid = 'usr_' || substr(md5(random()::text || id::text), 1, 16)
WHERE public_uid IS NULL;

-- Make public_uid NOT NULL and UNIQUE
ALTER TABLE users ALTER COLUMN public_uid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_uid ON users(public_uid);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);

-- 4. Backfill email_verified for active accounts
UPDATE users
SET email_verified = TRUE, email_verified_at = COALESCE(created_at, NOW())
WHERE status = 'ACTIVE' AND (email_verified IS FALSE OR email_verified IS NULL);

-- 5. Backfill suspension state for suspended accounts
UPDATE users
SET is_suspended = TRUE, suspended_at = COALESCE(updated_at, NOW())
WHERE status = 'SUSPENDED';

-- 6. Ensure default accounts for ADMIN and SUPPORT exist
-- Admin User
INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at)
VALUES (
  'admin@nexus.dev',
  '+1 555-0100',
  '$2a$10$c7LMrwioiryGwvA7xiquEeQEu8aawMu1KL5nHPSDnUoDk/6fN9NDa',
  'ADMIN',
  'ACTIVE',
  TRUE,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET 
  role = 'ADMIN',
  status = 'ACTIVE',
  email_verified = TRUE;

-- Support User
INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at)
VALUES (
  'support@nexus.dev',
  '+1 555-0101',
  '$2a$10$c7LMrwioiryGwvA7xiquEeQEu8aawMu1KL5nHPSDnUoDk/6fN9NDa',
  'SUPPORT',
  'ACTIVE',
  TRUE,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET 
  role = 'SUPPORT',
  status = 'ACTIVE',
  email_verified = TRUE;

-- Support Staff Profile for support@nexus.dev
INSERT INTO support_staff (user_id, department, title, support_level, permissions)
SELECT id, 'Tier 1 Operations', 'Platform Support Specialist', 'L1_SUPPORT', 
  '["SUPPORT_VIEW_TICKETS", "SUPPORT_REPLY_TICKETS", "SUPPORT_CHANGE_STATUS", "SUPPORT_CHANGE_PRIORITY", "SUPPORT_CREATE_BRIDGE", "SUPPORT_ADD_DEVELOPER", "SUPPORT_VIEW_INTERNAL_NOTES", "SUPPORT_ADD_INTERNAL_NOTES", "SUPPORT_RESOLVE_TICKETS", "SUPPORT_CLOSE_TICKETS"]'::jsonb
FROM users WHERE email = 'support@nexus.dev'
ON CONFLICT (user_id) DO NOTHING;
