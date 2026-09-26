-- Migration: 008_platform_settings.sql
-- Global platform configuration settings managed exclusively by CEO

CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_settings (key, value, description)
VALUES 
    ('credit_price_inr', '50'::jsonb, 'Unit price in INR per platform credit'),
    ('default_claim_cost', '1'::jsonb, 'Default claim cost in credits for open projects'),
    ('default_refund_percentage', '100'::jsonb, 'Percentage of credits refunded if developer is not selected'),
    ('maintenance_mode', 'false'::jsonb, 'Platform maintenance mode toggle')
ON CONFLICT (key) DO NOTHING;
