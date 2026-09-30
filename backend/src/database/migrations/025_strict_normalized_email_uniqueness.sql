-- Migration 025: Strict Case-Insensitive Normalized Email Uniqueness
-- Enforces PostgreSQL-level unique constraint on LOWER(TRIM(email)) for all accounts.

-- 1. Ensure existing email addresses are cleanly trimmed and lowercased
UPDATE users SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email));

-- 2. Create unique index on normalized email expression to enforce case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_normalized_email ON users (LOWER(TRIM(email)));

-- 3. Also add index on LOWER(TRIM(provider_email)) on oauth_accounts for fast case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_normalized_email ON oauth_accounts (LOWER(TRIM(provider_email))) WHERE provider_email IS NOT NULL;
