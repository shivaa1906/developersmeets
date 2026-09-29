-- Migration 023: Add CLAIMS_CLOSED to project_status enum
DO $$
BEGIN
    ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'CLAIMS_CLOSED' AFTER 'CLAIMS_ACTIVE';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
