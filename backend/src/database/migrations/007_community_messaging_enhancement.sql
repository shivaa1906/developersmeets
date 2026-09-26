-- Migration: 007_community_messaging_enhancement.sql
-- Adds rich messaging, reactions, mentions, attachments, moderation, and pinning to community channels

-- 1. Add is_archived and archived_at to channels if not exists
ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- 2. Channel Messages table
CREATE TABLE IF NOT EXISTS channel_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    reply_to_id UUID REFERENCES channel_messages(id) ON DELETE SET NULL,
    mentions JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',
    has_code_block BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    pinned_at TIMESTAMP WITH TIME ZONE,
    pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    moderation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_reply ON channel_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_channel_messages_pinned ON channel_messages(channel_id, is_pinned);

-- 3. Channel Message Reactions table
CREATE TABLE IF NOT EXISTS channel_message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES channel_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON channel_message_reactions(message_id);
