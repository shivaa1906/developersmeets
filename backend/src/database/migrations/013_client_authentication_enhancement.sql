-- 013_client_authentication_enhancement.sql
-- Notification Preferences and Client Onboarding Support

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT TRUE,
  project_updates BOOLEAN DEFAULT TRUE,
  proposal_alerts BOOLEAN DEFAULT TRUE,
  support_ticket_updates BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);

-- Backfill default notification preferences for existing users
INSERT INTO notification_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
