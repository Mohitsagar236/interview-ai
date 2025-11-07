# Vercel Deployment Setup Guide - Complete Checklist

## ✅ Current Status
- **Serverless Functions**: 10/12 (under limit ✅)
- **Routing**: Configured in `vercel.json` ✅
- **Git Repository**: Connected to GitHub ✅

## 🔴 CRITICAL: Required Environment Variables

You **MUST** add these environment variables in your Vercel project settings:

### 1. Go to Vercel Dashboard
1. Open your project: https://vercel.com/dashboard
2. Click on your `interview-ai` project
3. Go to **Settings** → **Environment Variables**

### 2. Add These Required Variables

#### **Supabase (REQUIRED for activation & auth)**
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key
```

**How to get these:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to Settings → API
4. Copy:
   - Project URL → `SUPABASE_URL`
   - service_role key (secret) → `SUPABASE_SERVICE_ROLE_KEY`
   - anon public key → `SUPABASE_ANON_KEY`

#### **Razorpay (REQUIRED for payments)**
```
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

**How to get these:**
1. Go to https://dashboard.razorpay.com/
2. Settings → API Keys
3. Generate keys if you haven't
4. For webhook secret: Settings → Webhooks → Create webhook → Copy signing secret

#### **Email Service (OPTIONAL - for notifications)**

**Option A: SendGrid**
```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=your_verified_sender_email
REPLY_TO_EMAIL=support@yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com
```

**Option B: Mailgun**
```
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_DOMAIN=your_mailgun_domain
FROM_EMAIL=your_verified_sender_email
REPLY_TO_EMAIL=support@yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com
```

**Option C: AWS SES**
```
EMAIL_PROVIDER=aws-ses
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
FROM_EMAIL=your_verified_sender_email
REPLY_TO_EMAIL=support@yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com
```

#### **Other Payment Providers (OPTIONAL)**
```
CASHFREE_WEBHOOK_SECRET=your_cashfree_secret
PAYTM_MERCHANT_KEY=your_paytm_key
PHONEPE_SALT_KEY=your_phonepe_salt
PHONEPE_SALT_INDEX=1
```

---

## 📋 Deployment Checklist

### Step 1: Add Environment Variables ⚠️ **DO THIS FIRST**
- [ ] Add `SUPABASE_URL`
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Add `SUPABASE_ANON_KEY`
- [ ] Add `RAZORPAY_KEY_ID`
- [ ] Add `RAZORPAY_KEY_SECRET`
- [ ] Add `RAZORPAY_WEBHOOK_SECRET`
- [ ] Add email provider variables (optional but recommended)

### Step 2: Configure Supabase Tables
Make sure these tables exist in your Supabase database:

```sql
-- activation_codes table
CREATE TABLE IF NOT EXISTS activation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    code TEXT UNIQUE NOT NULL,
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    device_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);

-- subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    plan_type TEXT,
    status TEXT DEFAULT 'active',
    description TEXT,
    payment_id TEXT,
    order_id TEXT,
    amount NUMERIC,
    currency TEXT DEFAULT 'INR',
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action_type TEXT,
    action_details TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 3: Update Supabase Policies
Enable Row Level Security (RLS) and add policies:

```sql
-- Enable RLS
ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Policies for activation_codes
CREATE POLICY "Users can view their own activation codes"
ON activation_codes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all activation codes"
ON activation_codes FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- Policies for subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions"
ON subscriptions FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- Policies for activity_log
CREATE POLICY "Users can view their own activity"
ON activity_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all activity"
ON activity_log FOR ALL
USING (auth.jwt()->>'role' = 'service_role');
```

### Step 4: Configure Razorpay Webhook
1. Go to Razorpay Dashboard → Webhooks
2. Create new webhook with URL: `https://your-domain.vercel.app/api/razorpay-webhook`
3. Select events:
   - `payment.authorized`
   - `payment.captured`
   - `payment.failed`
4. Copy the webhook secret and add it to Vercel environment variables

### Step 5: Update Frontend Configuration
Make sure `public/supabase-config.js` has correct values:

```javascript
const SUPABASE_CONFIG = {
    url: 'your_supabase_url', // Same as SUPABASE_URL
    anonKey: 'your_supabase_anon_key', // Same as SUPABASE_ANON_KEY
    persistSession: false // IMPORTANT: Keep this false for session-only mode
};
```

### Step 6: Redeploy
After adding environment variables:
1. Go to Vercel Dashboard → Deployments
2. Click on latest deployment → **Redeploy**
3. Wait for deployment to complete (~2 minutes)

---

## 🔍 How to Find Your Environment Variables

### Supabase
1. **URL**: https://supabase.com/dashboard → Select Project → Settings → API → Project URL
2. **Keys**: Same page → API Keys section → Copy `anon` (public) and `service_role` (secret)

### Razorpay
1. **Keys**: https://dashboard.razorpay.com/ → Settings → API Keys
2. **Webhook Secret**: Settings → Webhooks → Add/Edit Webhook → Copy Signing Secret

### Email Providers
- **SendGrid**: https://app.sendgrid.com/ → Settings → API Keys
- **Mailgun**: https://app.mailgun.com/ → Settings → API Keys
- **AWS SES**: AWS Console → IAM → Create API keys

---

## 🚨 Current Error Fix

**Error**: `Server configuration error`

**Cause**: Missing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel

**Solution**:
1. Go to Vercel → Your Project → Settings → Environment Variables
2. Add both required Supabase variables
3. Redeploy the project

---

## 📊 API Endpoints Status

All these endpoints are deployed and working (once env vars are added):

1. ✅ `/api/activation?action=generate` - Generate activation code
2. ✅ `/api/activation?action=activate` - Activate desktop
3. ✅ `/api/activation?action=get-credits` - Get credits
4. ✅ `/api/activation?action=update-credits` - Update credits
5. ✅ `/api/activation?action=deactivate` - Deactivate code
6. ✅ `/api/grant-free-credits` - Grant free credits (FREEDOM coupon)
7. ✅ `/api/create-razorpay-order` - Create payment order
8. ✅ `/api/verify-razorpay-payment` - Verify payment
9. ✅ `/api/razorpay-webhook` - Razorpay webhook handler
10. ✅ `/api/verify-payment-auto` - Auto verify payment

---

## 🎯 Testing After Deployment

### Test 1: Activation Code Generation
1. Log in to your website
2. Go to Profile page
3. You should see activation code or "Generate Code" button
4. **Expected**: Code displays successfully
5. **If fails**: Check Vercel logs for error

### Test 2: Free Credits (FREEDOM Coupon)
1. Go to Payment page
2. Select a credits package
3. Enter coupon code: `FREEDOM`
4. Click Apply
5. **Expected**: Price becomes ₹0 and credits granted
6. **If fails**: Check if user is logged in first

### Test 3: Desktop App Activation
1. Run desktop app
2. Enter activation code from profile
3. **Expected**: App activates and shows credits
4. **If fails**: Check API endpoint logs

---

## 📝 Troubleshooting

### Issue: 500 Server Error
- **Cause**: Missing environment variables
- **Fix**: Add all required env vars in Vercel and redeploy

### Issue: 404 Not Found
- **Cause**: API routing not configured
- **Fix**: Already fixed in `vercel.json` - just redeploy

### Issue: Unauthorized/Auth Errors
- **Cause**: Wrong Supabase keys or policies not set
- **Fix**: 
  1. Verify keys are correct
  2. Check RLS policies in Supabase
  3. Ensure `SUPABASE_SERVICE_ROLE_KEY` is used (not anon key)

### Issue: Payment Not Working
- **Cause**: Missing Razorpay credentials
- **Fix**: Add Razorpay keys to environment variables

---

## 🎉 Quick Start (Minimum Required)

**To get your site working RIGHT NOW, add these 3 variables:**

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `SUPABASE_ANON_KEY`

Then redeploy. Everything else (payments, emails) can be added later!

---

## 📞 Need Help?

1. Check Vercel deployment logs: Dashboard → Deployments → Click deployment → View Logs
2. Check Supabase logs: Supabase Dashboard → Logs
3. Check browser console for frontend errors (F12)

---

**Last Updated**: After consolidating to 10 serverless functions (under 12 limit)
**Status**: Ready to deploy once environment variables are added ✅
