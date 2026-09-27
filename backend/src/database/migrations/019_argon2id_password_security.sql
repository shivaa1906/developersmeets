-- Migration: 019_argon2id_password_security.sql
-- Description: Argon2id password security foundation, session token versioning, and primary leadership credentials

-- 1. Ensure password_hash column is VARCHAR(255) for Argon2id hash strings
ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255);

-- 2. Ensure token_version column exists with default 1 for immediate session invalidation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- 3. Ensure password_changed_at column exists for tracking password change events
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 4. Ensure index on (id, token_version) for high-performance session validation
CREATE INDEX IF NOT EXISTS idx_users_id_token_version ON users(id, token_version);

-- 5. Ensure primary CEO account shivaa1906@gmail.com exists with role CEO and status ACTIVE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'shivaa1906@gmail.com') THEN
        INSERT INTO users (email, password_hash, role, status, email_verified, email_verified_at)
        VALUES (
            'shivaa1906@gmail.com',
            '$argon2id$v=19$m=65536,t=3,p=4$qE8GjP1fBvBvN0u1Z5gX1A$rK8XlO4Q1L2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8',
            'CEO',
            'ACTIVE',
            TRUE,
            NOW()
        );
    ELSE
        UPDATE users SET role = 'CEO', status = 'ACTIVE' WHERE email = 'shivaa1906@gmail.com';
    END IF;
END $$;
