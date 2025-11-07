# 🔍 Activation Code Error Diagnostic Guide

## Error Summary
**Error:** 500 Internal Server Error when generating activation code
**Endpoint:** `POST https://interviewai.space/api/activation?action=generate`

## Quick Fix Steps

### Step 1: Wait for Deployment
The code changes are being deployed to Vercel. Wait 1-2 minutes for the deployment to complete.

### Step 2: Run Diagnostic Tests
1. Visit: **https://interviewai.space/test-activation.html**
2. Log in to your profile first at: **https://interviewai.space/profile.html**
3. Then go back to test page and click the buttons in order:
   - "1. Check Authentication"
   - "2. Run Diagnostic Test" 
   - "3. Test Generate Code"

### Step 3: Check Results
The diagnostic test will tell you exactly what's wrong:

#### Possible Issues:

**A) Missing Environment Variables on Vercel**
If diagnostic shows `supabaseUrl: false` or `supabaseServiceKey: false`:
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Add these variables:
  - `SUPABASE_URL` = your Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key

**B) Database Table Missing**
If diagnostic shows `activationCodesTableExists: false`:
- Run the migration SQL in your Supabase SQL Editor:
  ```sql
  -- See: create-activation-codes-table.sql
  ```

**C) Invalid Token**
If diagnostic shows `tokenValid: false`:
- Log out and log back in
- Session may have expired

**D) Subscription Table Issues**
If diagnostic shows `subscriptionsTableExists: false`:
- Your subscriptions table needs to be created
- Run the credits migration SQL

## Enhanced Logging
The following logs are now available in Vercel:
- `[Activation API]` - Main routing and initialization
- `[Generate Activation]` - Code generation flow
- All errors now include detailed error messages and stack traces

## Check Vercel Logs
1. Go to: https://vercel.com/dashboard
2. Find your project
3. Click on the latest deployment
4. Go to "Functions" tab
5. Find `/api/activation` function
6. Click "View Logs"
7. Look for error messages starting with `[Activation API]` or `[Generate Activation]`

## Common Error Patterns

### Pattern 1: "Server configuration error"
**Cause:** Missing Supabase environment variables
**Fix:** Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel

### Pattern 2: "Database error"
**Cause:** activation_codes table doesn't exist or has wrong schema
**Fix:** Run create-activation-codes-table.sql in Supabase

### Pattern 3: "Unauthorized - Invalid token"
**Cause:** Expired or invalid session token
**Fix:** Log out and log back in

### Pattern 4: "Failed to create activation code" with code 23505
**Cause:** Unique constraint violation (rare, auto-retries 5 times)
**Fix:** Usually resolves automatically on retry

## Testing After Fix

1. Clear browser cache (Ctrl+Shift+Delete)
2. Log out from profile page
3. Log back in
4. Try generating activation code
5. Try regenerating activation code

## Manual Test with cURL

```bash
# Replace YOUR_TOKEN with your actual session token
curl -X POST https://interviewai.space/api/activation?action=generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"regenerate": false}'
```

## Next Steps After Diagnosis

Once you run the diagnostic test, share the results and I can provide specific fixes for your exact issue.

The most common cause is **missing environment variables on Vercel**. Check that first!
