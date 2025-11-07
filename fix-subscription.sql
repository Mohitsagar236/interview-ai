-- Sync ALL subscriptions from activation codes
-- This will update subscription records for ALL users based on their activation codes
-- Run this in Supabase SQL Editor

-- Step 1: Check current activation codes (optional - for verification)
SELECT user_id, user_email, plan_type, credits_total, credits_used 
FROM activation_codes 
WHERE is_active = true
ORDER BY created_at DESC;

-- Step 2: Automatically sync ALL subscriptions from activation codes
-- This will create or update subscription records for ALL users
INSERT INTO subscriptions (
    user_id,
    plan_type,
    credits_total,
    credits_used,
    status,
    created_at,
    updated_at
)
SELECT 
    user_id,
    plan_type,
    credits_total,
    credits_used,
    'active' as status,
    NOW() as created_at,
    NOW() as updated_at
FROM activation_codes
WHERE is_active = true
ON CONFLICT (user_id) 
DO UPDATE SET
    plan_type = EXCLUDED.plan_type,
    credits_total = EXCLUDED.credits_total,
    credits_used = EXCLUDED.credits_used,
    status = 'active',
    updated_at = NOW();

-- Step 3: Verify the updates for ALL users
SELECT 
    s.user_id,
    a.user_email,
    s.plan_type,
    s.credits_total,
    s.credits_used,
    s.status,
    a.code as activation_code,
    s.updated_at
FROM subscriptions s
INNER JOIN activation_codes a ON a.user_id = s.user_id AND a.is_active = true
ORDER BY s.updated_at DESC;
