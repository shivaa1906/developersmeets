-- Migration 026: Account Linking and Duplicate Protection
-- Provides secure state binding table and database constraints for multi-provider linking

-- 1. Create table for OAuth linking state transactions bound to authenticated platform users
CREATE TABLE IF NOT EXISTS oauth_link_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    code_verifier VARCHAR(255) NOT NULL,
    return_url VARCHAR(500) NOT NULL DEFAULT '/dashboard/settings',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_link_states_state ON oauth_link_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_link_states_user_id ON oauth_link_states(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_link_states_expires ON oauth_link_states(expires_at);

-- 2. Enforce that a platform user can connect at most ONE account per provider
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_user_provider ON oauth_accounts (user_id, provider);
