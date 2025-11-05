-- Migration to add credits columns to existing subscriptions table
-- Run this in Supabase SQL Editor if you already have the subscriptions table

-- Add credits columns if they don't exist
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS credits_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;

-- Update existing records to set credits based on plan type
-- Basic plan: 3 credits, Plus plan: 8 credits (6+2), Advanced plan: 15 credits (9+6)
UPDATE subscriptions 
SET credits_total = CASE 
    WHEN plan_type = 'basic' THEN 3
    WHEN plan_type = 'plus' THEN 8
    WHEN plan_type = 'advanced' THEN 15
    ELSE credits_total
END
WHERE plan_type IN ('basic', 'plus', 'advanced') AND credits_total = 0;

-- Create index for faster credit checks
CREATE INDEX IF NOT EXISTS idx_subscriptions_credits ON subscriptions(user_id, credits_used, credits_total);
