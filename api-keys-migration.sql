-- API Keys Migration for Desktop App Authentication
-- This creates a table to store API keys for desktop app access

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
CREATE POLICY "Users can view own API keys"
    ON api_keys
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own API keys
CREATE POLICY "Users can insert own API keys"
    ON api_keys
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys
CREATE POLICY "Users can update own API keys"
    ON api_keys
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete own API keys"
    ON api_keys
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can do everything (for API validation)
-- This is handled automatically by Supabase with service_role key

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

-- Add comment to table
COMMENT ON TABLE api_keys IS 'API keys for desktop application authentication and credit synchronization';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key for secure storage';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of the key for user identification (e.g., ia_12345...)';
COMMENT ON COLUMN api_keys.last_used_at IS 'Last time this API key was used to make a request';
