-- ==============================================================================
-- MIGRATION 020: USER & DEVELOPER AVATAR AND PROFILE PHOTO STORAGE
-- ==============================================================================

-- 1. Ensure users table has profile photo, avatar URL, and display name columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(150);

-- 2. Expand developer avatar & photo columns from VARCHAR(500) to TEXT to support Data URLs & Base64
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'developers' AND column_name = 'profile_photo'
    ) THEN
        ALTER TABLE developers ALTER COLUMN profile_photo TYPE TEXT;
    ELSE
        ALTER TABLE developers ADD COLUMN profile_photo TEXT;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'developers' AND column_name = 'profile_image'
    ) THEN
        ALTER TABLE developers ALTER COLUMN profile_image TYPE TEXT;
    ELSE
        ALTER TABLE developers ADD COLUMN profile_image TEXT;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'developers' AND column_name = 'avatar_url'
    ) THEN
        ALTER TABLE developers ALTER COLUMN avatar_url TYPE TEXT;
    ELSE
        ALTER TABLE developers ADD COLUMN avatar_url TEXT;
    END IF;
END $$;

-- 3. Ensure clients table has avatar_url and updated_at
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
