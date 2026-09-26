-- 004_inquiries_and_profile_views.sql
-- Direct client inquiries, profile views tracking, and developer metrics

-- 1. INQUIRIES TABLE
CREATE TABLE IF NOT EXISTS inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    client_tag VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    preview TEXT,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inquiries_developer ON inquiries(developer_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_client ON inquiries(client_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);

-- 2. DEVELOPER PROFILE VIEWS TABLE
CREATE TABLE IF NOT EXISTS developer_profile_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    viewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    viewer_ip VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_profile_views_developer ON developer_profile_views(developer_id);

-- 3. PROFILE VIEWS COUNTER COLUMN ON DEVELOPERS
ALTER TABLE developers ADD COLUMN IF NOT EXISTS profile_views_count INTEGER NOT NULL DEFAULT 0;
