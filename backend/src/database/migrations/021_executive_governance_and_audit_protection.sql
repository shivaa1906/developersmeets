-- Migration: 021_executive_governance_and_audit_protection.sql
-- Description: Implement database-level self-protection for primary CEO account, audit log immutability, and executive governance.

-- 1. Ensure primary CEO account protection trigger
CREATE OR REPLACE FUNCTION protect_primary_ceo_account() RETURNS TRIGGER AS $$
BEGIN
    -- Check if target user is the primary CEO by email or existing role
    IF OLD.email = 'shivaa1906@gmail.com' THEN
        -- Prevent changing CEO email
        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Primary CEO email is protected and cannot be changed';
        END IF;

        -- Prevent downgrading or transferring CEO role
        IF NEW.role IS DISTINCT FROM 'CEO' THEN
            RAISE EXCEPTION 'Primary CEO account cannot be downgraded from CEO role';
        END IF;

        -- Prevent suspending or disabling CEO account
        IF NEW.status IN ('SUSPENDED', 'DISABLED') OR NEW.is_suspended = TRUE THEN
            RAISE EXCEPTION 'Primary CEO account cannot be suspended or disabled';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_primary_ceo_account ON users;
CREATE TRIGGER trg_protect_primary_ceo_account
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION protect_primary_ceo_account();

-- 2. Prevent deletion of primary CEO account
CREATE OR REPLACE FUNCTION prevent_primary_ceo_deletion() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.email = 'shivaa1906@gmail.com' OR OLD.role = 'CEO' THEN
        RAISE EXCEPTION 'Chief Executive Officer account is protected and cannot be deleted';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_primary_ceo_deletion ON users;
CREATE TRIGGER trg_prevent_primary_ceo_deletion
    BEFORE DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION prevent_primary_ceo_deletion();

-- 3. Audit Log Immutability: Prevent UPDATE or DELETE on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_log_tampering() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_tampering ON audit_logs;
CREATE TRIGGER trg_prevent_audit_log_tampering
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_tampering();

-- 4. Default permissions for CEO and MD
UPDATE users
SET permissions = '["*"]'::jsonb
WHERE role = 'CEO' AND (permissions IS NULL OR permissions = '[]'::jsonb);

UPDATE users
SET permissions = '[
  "developers:read",
  "developers:write",
  "projects:read",
  "projects:write",
  "clients:read",
  "claims:read",
  "claims:write",
  "inquiries:read",
  "inquiries:write",
  "analytics:read",
  "audit_logs:read",
  "payments:read",
  "ledger:read",
  "support:read",
  "support:tickets:read",
  "support:tickets:write",
  "community:read",
  "community:write"
]'::jsonb
WHERE role = 'MD' AND (permissions IS NULL OR permissions = '[]'::jsonb);
