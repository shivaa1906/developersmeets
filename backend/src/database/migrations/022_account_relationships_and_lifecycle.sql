-- Migration 022: Account Relationships and Lifecycle Foundation
-- Future-proofing cross-account relationships (e.g. Client + Developer ownership links, OAuth links)

CREATE TABLE IF NOT EXISTS user_account_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    primary_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    linked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL DEFAULT 'CLIENT_DEVELOPER', -- CLIENT_DEVELOPER, SUBSIDIARY, OAUTH_LINK
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_diff_users CHECK (primary_user_id <> linked_user_id),
    CONSTRAINT uq_user_pair UNIQUE (primary_user_id, linked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_account_links_primary ON user_account_links(primary_user_id);
CREATE INDEX IF NOT EXISTS idx_user_account_links_linked ON user_account_links(linked_user_id);
