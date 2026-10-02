-- Migration: 027_session_security_hardening.sql
-- Description: Phase 11 session & security hardening, token versioning consistency, and indexing

-- 1. Ensure token_version is non-null for all users with default 1
UPDATE users SET token_version = 1 WHERE token_version IS NULL;
ALTER TABLE users ALTER COLUMN token_version SET DEFAULT 1;
ALTER TABLE users ALTER COLUMN token_version SET NOT NULL;

-- 2. Performance indexes for session verification and security audits
CREATE INDEX IF NOT EXISTS idx_users_id_token_version ON users(id, token_version);
CREATE INDEX IF NOT EXISTS idx_users_status_suspended ON users(status, is_suspended);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_actor ON audit_logs(action, actor_user_id);
