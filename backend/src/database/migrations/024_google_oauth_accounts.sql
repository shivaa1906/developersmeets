-- Migration 024: Google OAuth Provider Identity Foundation
-- Creates oauth_accounts table for federated identity and makes password_hash nullable for OAuth accounts.

-- 1. Ensure password_hash is nullable for OAuth users who authenticate without a local password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Create oauth_accounts table
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    provider_email_verified BOOLEAN DEFAULT FALSE,
    provider_display_name VARCHAR(255),
    provider_avatar_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_oauth_provider_subject UNIQUE (provider, provider_subject)
);

-- 3. Create high-performance indexes for provider lookup and user queries
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_subject ON oauth_accounts(provider, provider_subject);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_email ON oauth_accounts(provider, provider_email);
