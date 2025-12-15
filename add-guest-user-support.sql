-- Add support for guest users (users who paid but haven't signed up yet)
-- This allows credits to be granted even if user doesn't have a Supabase account

-- Make user_id nullable to support guest users
ALTER TABLE subscriptions 
ALTER COLUMN user_id DROP NOT NULL;

-- Add email and name fields for guest users
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS user_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);

-- Create index on user_email for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_email ON subscriptions(user_email);

-- Update RLS policies to allow service role to insert/update for guest users
DROP POLICY IF EXISTS "Service role can manage all subscriptions" ON subscriptions;
CREATE POLICY "Service role can manage all subscriptions"
    ON subscriptions 
    FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Allow users to view subscriptions by email (for guest users claiming later)
DROP POLICY IF EXISTS "Users can view subscriptions by email" ON subscriptions;
CREATE POLICY "Users can view subscriptions by email"
    ON subscriptions FOR SELECT
    USING (
        auth.uid() = user_id OR 
        auth.jwt() ->> 'email' = user_email
    );

COMMENT ON COLUMN subscriptions.user_email IS 'Email for guest users who paid but haven''t signed up yet';
COMMENT ON COLUMN subscriptions.user_name IS 'Name for guest users who paid but haven''t signed up yet';
