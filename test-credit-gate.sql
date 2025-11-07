-- Quick SQL commands to test the credit gate system

-- ============================================================
-- TEST 1: Set credits to 0 (to test no-credits window)
-- ============================================================
-- Replace 'your-email@example.com' with your actual email

-- Find your user ID first
SELECT id, email FROM auth.users WHERE email = 'interviewai.space@gmail.com';

-- Then update credits to 0
UPDATE subscriptions 
SET credits_total = 0, 
    credits_used = 0 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'interviewai.space@gmail.com');

-- Verify the change
SELECT user_id, plan_type, credits_total, credits_used, (credits_total - credits_used) as remaining 
FROM subscriptions 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'interviewai.space@gmail.com');

-- ============================================================
-- TEST 2: Restore credits (after testing no-credits window)
-- ============================================================

-- Restore to advanced plan (15 credits)
UPDATE subscriptions 
SET credits_total = 15, 
    credits_used = 0,
    plan_type = 'advanced'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'interviewai.space@gmail.com');

-- Verify credits restored
SELECT user_id, plan_type, credits_total, credits_used, (credits_total - credits_used) as remaining 
FROM subscriptions 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'interviewai.space@gmail.com');

-- ============================================================
-- TEST 3: Simulate partial usage (test low credits)
-- ============================================================

-- Set to 0.5 credits remaining (30 minutes)
UPDATE subscriptions 
SET credits_total = 15, 
    credits_used = 14.5
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'interviewai.space@gmail.com');

-- ============================================================
-- TEST 4: View all subscriptions
-- ============================================================

SELECT 
    s.user_id,
    u.email,
    s.plan_type,
    s.credits_total,
    s.credits_used,
    (s.credits_total - s.credits_used) as credits_remaining,
    s.status,
    s.created_at
FROM subscriptions s
LEFT JOIN auth.users u ON s.user_id = u.id
ORDER BY s.created_at DESC;

-- ============================================================
-- TESTING WORKFLOW
-- ============================================================

-- Step 1: Run TEST 1 SQL (set credits to 0)
-- Step 2: Restart desktop app: npm start
-- Step 3: Login
-- Step 4: Should see "No Credits Available" window
-- Step 5: Try Ctrl+Shift+T - should not show toolbar
-- Step 6: Run TEST 2 SQL (restore credits to 15)
-- Step 7: In no-credits window, click "Refresh Credits"
-- Step 8: Window should close, toolbar should now be accessible

-- ============================================================
-- CLEANUP: Reset to fresh state
-- ============================================================

-- Reset user to advanced plan with 23 credits (15 + 8 bonus)
UPDATE subscriptions 
SET credits_total = 23, 
    credits_used = 0,
    plan_type = 'advanced',
    status = 'active'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'interviewai.space@gmail.com');
