# 🎯 NEXT STEPS - Credits System Setup

## ✅ What's Already Done

All code has been implemented:
- ✅ Credits Manager (`electron/credits-manager.js`)
- ✅ IPC Handlers in `electron/main.js`
- ✅ Toolbar UI with credits display
- ✅ Payment integration for credit addition
- ✅ Profile page with credits info
- ✅ Database schema updated
- ✅ Dependencies installed

## 🔧 Step 1: Configure Your Credentials

You have **3 options**:

### Option A: Interactive Setup (Recommended)
```bash
node setup-credits.js
```
This will prompt you for:
- Supabase URL
- Supabase Anon Key
- Supabase Service Key (optional)
- Razorpay Key ID
- Razorpay Secret

### Option B: Use Setup Menu
```bash
setup-credits.bat
```
Windows menu with multiple options for setup and testing.

### Option C: Manual Edit
Edit `.env` file directly and replace these placeholders:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
```

### Where to Find Credentials:

**Supabase:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to Settings → API
4. Copy:
   - Project URL → `SUPABASE_URL`
   - anon public key → `SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_KEY`

**Razorpay:**
1. Go to https://dashboard.razorpay.com/
2. Settings → API Keys
3. Generate keys (or use existing)
4. Copy:
   - Key ID → `RAZORPAY_KEY_ID`
   - Key Secret → `RAZORPAY_KEY_SECRET`

---

## 🗄️ Step 2: Run Database Migration

### In Supabase Dashboard:

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in left sidebar
4. Click **+ New Query**
5. Copy and paste this SQL:

```sql
-- Add credits columns to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS credits_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;

-- Update existing records based on plan type
UPDATE subscriptions 
SET credits_total = CASE 
    WHEN plan_type = 'basic' THEN 3
    WHEN plan_type = 'plus' THEN 8
    WHEN plan_type = 'advanced' THEN 15
    ELSE credits_total
END
WHERE plan_type IN ('basic', 'plus', 'advanced') AND credits_total = 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_credits 
ON subscriptions(user_id, credits_used, credits_total);
```

6. Click **Run** or press `Ctrl+Enter`
7. Verify: Should say "Success. No rows returned"

### Verify Migration:

```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'subscriptions' 
AND column_name IN ('credits_total', 'credits_used');
```

Should return 2 rows.

---

## 🧪 Step 3: Test the System

### Test 1: Verify Setup
```bash
node test-credits-setup.js
```
Should show all green checkmarks ✅

### Test 2: Test Supabase Connection
```bash
node -e "const { createClient } = require('@supabase/supabase-js'); require('dotenv').config(); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY); supabase.from('subscriptions').select('count').then(r => console.log(r.error ? '❌ Failed: ' + r.error.message : '✅ Connected!'))"
```

### Test 3: Start Development Server
```bash
npm run dev
```

### Test 4: Test Payment Flow

1. Visit: `http://localhost:3000/payment.html?product=basic`
2. Complete a test payment
3. Check Supabase → Table Editor → subscriptions
4. Verify credits_total = 3

### Test 5: Test Desktop App

1. Build the app:
   ```bash
   npm run build:prod
   ```

2. Run the built app

3. Login with test user

4. Check toolbar - should show credits

5. Start an interview session

6. End session - credits should be deducted

---

## 📊 Verification Checklist

After completing all steps, verify:

- [ ] `.env` has Supabase credentials
- [ ] `.env` has Razorpay credentials
- [ ] Database migration ran successfully
- [ ] Test script shows all green ✅
- [ ] Supabase connection test passes
- [ ] Test payment adds credits to database
- [ ] Desktop app displays credits in toolbar
- [ ] Session tracking deducts credits correctly
- [ ] Profile page shows credit information

---

## 🐛 Troubleshooting

### Issue: "Connection failed" when testing Supabase

**Solution:**
- Check SUPABASE_URL format (should start with https://)
- Verify SUPABASE_ANON_KEY is correct
- Check internet connection
- Verify project is active in Supabase

### Issue: Migration SQL fails

**Solution:**
- Check if subscriptions table exists first
- Run `supabase-migrations.sql` to create table
- Then run `credits-migration.sql`

### Issue: Credits not showing in desktop app

**Solution:**
- Check console logs in app (View → Toggle Developer Tools)
- Verify credits-manager.js is loaded
- Check if IPC handlers are registered
- Verify user is logged in

### Issue: Payment doesn't add credits

**Solution:**
- Check API logs in Vercel/deployment platform
- Verify Razorpay webhook is configured
- Check if user email matches Supabase auth user
- Verify SUPABASE credentials in API functions

### Issue: Credits not deducting after session

**Solution:**
- Check electron console logs
- Verify session actually ended (not just closed)
- Check credits.json file in user data directory
- Verify credits-manager is initialized

---

## 📞 Need Help?

- **Documentation:** `CREDITS_SYSTEM_README.md` - Full technical docs
- **Setup Guide:** `CREDITS_SETUP_QUICK_GUIDE.md` - Quick reference
- **Test Script:** Run `node test-credits-setup.js`
- **Setup Menu:** Run `setup-credits.bat` (Windows)

---

## 🚀 Quick Commands Reference

```bash
# Configure credentials (interactive)
node setup-credits.js

# Test setup
node test-credits-setup.js

# Test Supabase connection
node -e "const { createClient } = require('@supabase/supabase-js'); require('dotenv').config(); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY); console.log('Testing...'); supabase.from('subscriptions').select('count').then(r => console.log(r.error ? '❌ ' + r.error.message : '✅ Connected!'))"

# Start dev server
npm run dev

# Build desktop app
npm run build:prod

# Run desktop app
npm start
```

---

## ✨ Success!

Once all steps are complete:
1. Users can purchase credits via payment page
2. Credits automatically sync to desktop app
3. Interview sessions track time and deduct credits
4. Profile page shows credit balance
5. System warns when credits are low
6. Blocks sessions when credits reach zero

**You're all set!** 🎉

The credits system is now fully integrated and ready to use.
