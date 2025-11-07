-- ============================================================
-- COMPLETE DATABASE MIGRATION FOR INTERVIEW AI ASSISTANT
-- Run this ONCE in Supabase SQL Editor
-- ============================================================
-- This file combines:
-- 1. Main tables (subscriptions, usage_stats, activity_log)
-- 2. API keys table (for desktop authentication)
-- 3. Credits columns (for credit tracking)
-- ============================================================

-- ============================================================
-- PART 1: MAIN TABLES (subscriptions, usage_stats, activity_log)
-- ============================================================

-- Subscription table for tracking user subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    payment_id VARCHAR(255),
    order_id VARCHAR(255),
    amount DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'INR',
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Usage statistics table for tracking user activity
CREATE TABLE IF NOT EXISTS usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sessions_used INTEGER DEFAULT 0,
    minutes_used INTEGER DEFAULT 0,
    responses_used INTEGER DEFAULT 0,
    scans_used INTEGER DEFAULT 0,
    last_session_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Activity log table for tracking user actions
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    action_details TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_credits ON subscriptions(user_id, credits_used, credits_total);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_id ON usage_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_usage_stats_updated_at ON usage_stats;
CREATE TRIGGER update_usage_stats_updated_at
    BEFORE UPDATE ON usage_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
DROP POLICY IF EXISTS "Users can view their own subscription" ON subscriptions;
CREATE POLICY "Users can view their own subscription"
    ON subscriptions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own subscription" ON subscriptions;
CREATE POLICY "Users can insert their own subscription"
    ON subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own subscription" ON subscriptions;
CREATE POLICY "Users can update their own subscription"
    ON subscriptions FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for usage_stats
DROP POLICY IF EXISTS "Users can view their own usage stats" ON usage_stats;
CREATE POLICY "Users can view their own usage stats"
    ON usage_stats FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own usage stats" ON usage_stats;
CREATE POLICY "Users can insert their own usage stats"
    ON usage_stats FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own usage stats" ON usage_stats;
CREATE POLICY "Users can update their own usage stats"
    ON usage_stats FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for activity_log
DROP POLICY IF EXISTS "Users can view their own activity log" ON activity_log;
CREATE POLICY "Users can view their own activity log"
    ON activity_log FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own activity log" ON activity_log;
CREATE POLICY "Users can insert their own activity log"
    ON activity_log FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- PART 2: API KEYS TABLE (for desktop authentication)
-- ============================================================

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL, -- First 8 chars for identification (e.g., "ia_12345...")
    name TEXT DEFAULT 'Desktop App Key',
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- NULL means never expires
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT unique_active_key_per_user UNIQUE (user_id, is_active)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own API keys
DROP POLICY IF EXISTS "Users can view own API keys" ON api_keys;
CREATE POLICY "Users can view own API keys"
    ON api_keys
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own API keys
DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
CREATE POLICY "Users can insert own API keys"
    ON api_keys
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys
DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
CREATE POLICY "Users can update own API keys"
    ON api_keys
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own API keys
DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;
CREATE POLICY "Users can delete own API keys"
    ON api_keys
    FOR DELETE
    USING (auth.uid() = user_id);

-- Function to clean up old expired keys (optional, run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_api_keys()
RETURNS void AS $$
BEGIN
    DELETE FROM api_keys
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW()
    AND is_active = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments to table
COMMENT ON TABLE api_keys IS 'API keys for desktop application authentication and credit synchronization';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key for secure storage';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of the key for user identification (e.g., ia_12345...)';
COMMENT ON COLUMN api_keys.last_used_at IS 'Last time this API key was used to make a request';

-- ============================================================
-- PART 3: ACTIVATION CODES TABLE (for simple desktop authentication)
-- ============================================================

-- Create activation_codes table for desktop app access
CREATE TABLE IF NOT EXISTS activation_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    credits_total INTEGER NOT NULL DEFAULT 0,
    credits_used INTEGER NOT NULL DEFAULT 0,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'free',
    user_email TEXT NOT NULL,
    user_name TEXT,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiry
    device_info JSONB, -- Store device details when activated
    CONSTRAINT unique_active_code_per_user UNIQUE (user_id, is_active)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activation_codes_user_id ON activation_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_active ON activation_codes(is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for activation_codes
-- Users can view their own activation codes
DROP POLICY IF EXISTS "Users can view own activation codes" ON activation_codes;
CREATE POLICY "Users can view own activation codes"
    ON activation_codes
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own activation codes
DROP POLICY IF EXISTS "Users can insert own activation codes" ON activation_codes;
CREATE POLICY "Users can insert own activation codes"
    ON activation_codes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own activation codes
DROP POLICY IF EXISTS "Users can update own activation codes" ON activation_codes;
CREATE POLICY "Users can update own activation codes"
    ON activation_codes
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own activation codes
DROP POLICY IF EXISTS "Users can delete own activation codes" ON activation_codes;
CREATE POLICY "Users can delete own activation codes"
    ON activation_codes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Function to clean up old expired codes (optional, run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_activation_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM activation_codes
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW()
    AND is_active = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments to table
COMMENT ON TABLE activation_codes IS 'Activation codes for desktop application access and credit synchronization';
COMMENT ON COLUMN activation_codes.code IS 'Unique activation code for desktop app (e.g., XXXX-XXXX-XXXX-XXXX)';
COMMENT ON COLUMN activation_codes.credits_total IS 'Total credits available at time of code generation';
COMMENT ON COLUMN activation_codes.credits_used IS 'Credits consumed via desktop app';

-- ============================================================
-- PART 4: UPDATE EXISTING DATA (if tables already exist)
-- ============================================================

-- Update existing subscriptions to set credits based on plan type
UPDATE subscriptions 
SET credits_total = CASE 
    WHEN plan_type = 'basic' THEN 3
    WHEN plan_type = 'plus' THEN 8
    WHEN plan_type = 'advanced' THEN 15
    ELSE credits_total
END
WHERE plan_type IN ('basic', 'plus', 'advanced') AND credits_total = 0;

-- ============================================================
-- MIGRATION COMPLETE!
-- ============================================================
-- Tables created:
-- ✅ subscriptions (with credits_total, credits_used)
-- ✅ usage_stats
-- ✅ activity_log
-- ✅ api_keys
-- ✅ activation_codes (NEW - for simple desktop authentication)
--
-- Features enabled:
-- ✅ Row Level Security (RLS) on all tables
-- ✅ Automatic timestamp updates
-- ✅ Credit tracking
-- ✅ Desktop authentication via API keys
-- ✅ Desktop activation via simple codes
-- ============================================================
