# 🚀 Credits System - Quick Setup Guide

## Step 1: Database Setup

Run the migration in your Supabase SQL Editor:

```sql
-- Add credits columns to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS credits_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;

-- Create index
CREATE INDEX IF NOT EXISTS idx_subscriptions_credits 
ON subscriptions(user_id, credits_used, credits_total);
```

## Step 2: Environment Variables

Add to your `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-secret
```

## Step 3: Test the System

### Test Credit Purchase

1. Go to `http://localhost:3000/payment.html?product=basic`
2. Complete test payment
3. Check Supabase `subscriptions` table - should show 3 credits

### Test Desktop App

1. Build and run desktop app
2. Login with test user
3. Check toolbar - should show credits
4. Start interview session
5. End session - credits should be deducted

### Verify Credit Display

1. Open `http://localhost:3000/profile.html`
2. Should show credits purchased and remaining
3. Click credits in toolbar - shows details

## Step 4: Configure Plans

Edit `api/verify-razorpay-payment.js` to adjust credit amounts:

```javascript
const PLAN_CREDITS = {
    basic: 3,        // Change as needed
    plus: 8,         // Change as needed
    advanced: 15     // Change as needed
};
```

## Step 5: Test Scenarios

### ✅ User buys Basic plan (₹499)
- 3 credits added
- Can use 3 hours

### ✅ User session 42 minutes
- 0.7 credits deducted
- 2.3 credits remaining

### ✅ User tries to start with 0 credits
- Blocked with error message
- Prompted to purchase

## Common Commands

```bash
# Install dependencies
npm install @supabase/supabase-js

# Build desktop app
npm run build:electron

# Run desktop app in dev
npm run electron:dev

# Deploy API functions
vercel --prod
```

## Troubleshooting

**Credits not showing?**
- Check Supabase credentials in .env
- Verify user is logged in
- Check browser console for errors

**Credits not deducting?**
- Check electron/main.js logs
- Verify credits-manager.js initialized
- Check local data directory for credits.json

**Payment not adding credits?**
- Verify Razorpay webhook setup
- Check api/verify-razorpay-payment.js logs
- Verify Supabase connection

## Success Checklist

- [ ] Database migration completed
- [ ] Environment variables set
- [ ] Test payment successful
- [ ] Credits show in toolbar
- [ ] Credits show in profile
- [ ] Session tracking works
- [ ] Credits deduct correctly
- [ ] Low credit warnings appear
- [ ] Zero credits blocks sessions

## Next Steps

1. Customize credit amounts per plan
2. Set up email notifications
3. Add usage analytics
4. Configure payment webhooks
5. Test with real Razorpay account

---

**Ready to go!** 🎉

See `CREDITS_SYSTEM_README.md` for full documentation.
