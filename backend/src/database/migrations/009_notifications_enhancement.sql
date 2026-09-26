-- Migration 009: Notifications Enhancement
-- Adds deep link support, metadata payload, and performance indices for the notification system.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(500);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
