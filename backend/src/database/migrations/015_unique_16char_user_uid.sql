-- Migration: 015_unique_16char_user_uid.sql
-- Description: Implement permanent, cryptographically secure 16-character public UID for every platform user

-- 1. Ensure pgcrypto extension is installed for cryptographic random byte generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create PostgreSQL function to generate cryptographically random 16-character Base62 string
CREATE OR REPLACE FUNCTION generate_user_uid() RETURNS VARCHAR(16) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    result VARCHAR(16) := '';
    i INTEGER;
    bytes BYTEA;
    byte_val INTEGER;
BEGIN
    LOOP
        result := '';
        -- Generate 32 cryptographically secure random bytes
        bytes := gen_random_bytes(32);
        FOR i IN 0..31 LOOP
            byte_val := get_byte(bytes, i);
            -- Rejection sampling (62 * 4 = 248): discard byte values >= 248 to eliminate modulo bias
            IF byte_val < 248 THEN
                result := result || substr(chars, (byte_val % 62) + 1, 1);
                IF length(result) = 16 THEN
                    EXIT;
                END IF;
            END IF;
        END LOOP;
        
        -- Check if UID is already assigned to prevent any collision
        IF length(result) = 16 AND NOT EXISTS (SELECT 1 FROM users WHERE uid = result) THEN
            RETURN result;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 3. Add 'uid' column if it does not already exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS uid VARCHAR(16);

-- 4. Backfill existing users with unique 16-character UIDs (idempotent, existing UIDs are untouched)
UPDATE users 
SET uid = generate_user_uid()
WHERE uid IS NULL OR length(uid) != 16 OR uid !~ '^[A-Za-z0-9]{16}$';

-- Also synchronize legacy public_uid column with the canonical 16-character UID
UPDATE users
SET public_uid = uid
WHERE public_uid IS NULL OR public_uid != uid;

-- 5. Enforce NOT NULL and DEFAULT on users.uid
ALTER TABLE users ALTER COLUMN uid SET DEFAULT generate_user_uid();
ALTER TABLE users ALTER COLUMN uid SET NOT NULL;

-- 6. Enforce UNIQUE constraint via unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users(uid);

-- 7. Database-level immutability trigger: prevent modification of UID on existing users
CREATE OR REPLACE FUNCTION prevent_users_uid_change() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.uid IS NOT NULL AND NEW.uid IS DISTINCT FROM OLD.uid THEN
        RAISE EXCEPTION 'UID is immutable and cannot be modified';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_users_uid_change ON users;
CREATE TRIGGER trg_prevent_users_uid_change
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION prevent_users_uid_change();
