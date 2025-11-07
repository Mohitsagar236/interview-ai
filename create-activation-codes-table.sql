-- SQL Script to Create activation_codes Table in Supabase
-- Run this in Supabase SQL Editor if the table doesn't exist

-- Create activation_codes table
CREATE TABLE IF NOT EXISTS public.activation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    plan_type TEXT DEFAULT 'free',
    user_email TEXT,
    user_name TEXT,
    is_active BOOLEAN DEFAULT true,
    device_info JSONB DEFAULT '{}'::jsonb,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_activation_codes_user_id ON public.activation_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON public.activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_is_active ON public.activation_codes(is_active);

-- Enable Row Level Security
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own activation codes" ON public.activation_codes;
DROP POLICY IF EXISTS "Service role can manage all activation codes" ON public.activation_codes;
DROP POLICY IF EXISTS "Users can insert their own activation codes" ON public.activation_codes;
DROP POLICY IF EXISTS "Users can update their own activation codes" ON public.activation_codes;

-- RLS Policies for activation_codes
-- 1. Users can view their own activation codes
CREATE POLICY "Users can view their own activation codes"
ON public.activation_codes FOR SELECT
USING (auth.uid() = user_id);

-- 2. Users can insert their own activation codes
CREATE POLICY "Users can insert their own activation codes"
ON public.activation_codes FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 3. Users can update their own activation codes
CREATE POLICY "Users can update their own activation codes"
ON public.activation_codes FOR UPDATE
USING (auth.uid() = user_id);

-- 4. Service role can do everything (for API endpoints)
CREATE POLICY "Service role can manage all activation codes"
ON public.activation_codes FOR ALL
USING (true);

-- Grant permissions
GRANT ALL ON public.activation_codes TO authenticated;
GRANT ALL ON public.activation_codes TO service_role;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_activation_codes_updated_at ON public.activation_codes;

CREATE TRIGGER update_activation_codes_updated_at
    BEFORE UPDATE ON public.activation_codes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Verify table was created
SELECT 'activation_codes table created successfully!' as message;

-- Show table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'activation_codes'
ORDER BY ordinal_position;
