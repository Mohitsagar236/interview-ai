# 🚨 URGENT FIX - Server Configuration Error

## Current Error
```
Error loading activation code: Error: Server configuration error
```

## Root Cause
Missing environment variables in Vercel deployment.

## 🔥 IMMEDIATE FIX (5 Minutes)

### Step 1: Go to Vercel Dashboard
1. Open: https://vercel.com/dashboard
2. Click your **interview-ai** project
3. Go to **Settings** tab
4. Click **Environment Variables** in left sidebar

### Step 2: Add Required Variables
Click "Add New" and add these **3 CRITICAL** variables:

#### Variable 1:
- **Key**: `SUPABASE_URL`
- **Value**: Your Supabase project URL (looks like: `https://xxxxx.supabase.co`)
- **Environment**: Production, Preview, Development (select all 3)

#### Variable 2:
- **Key**: `SUPABASE_SERVICE_ROLE_KEY`
- **Value**: Your Supabase service role key (long secret string)
- **Environment**: Production, Preview, Development (select all 3)

#### Variable 3:
- **Key**: `SUPABASE_ANON_KEY`
- **Value**: Your Supabase anon/public key
- **Environment**: Production, Preview, Development (select all 3)

### Step 3: Get These Values from Supabase

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (gear icon) → **API**
4. You'll see:
   ```
   Project URL: https://xxxxx.supabase.co    ← Copy this for SUPABASE_URL
   
   API Keys:
   - anon public: eyJxxx...                  ← Copy for SUPABASE_ANON_KEY
   - service_role: eyJxxx...                 ← Copy for SUPABASE_SERVICE_ROLE_KEY
   ```

### Step 4: Redeploy
1. Go back to Vercel Dashboard → **Deployments** tab
2. Click on the latest deployment
3. Click **"Redeploy"** button (3 dots menu → Redeploy)
4. Wait ~1-2 minutes for deployment to complete

### Step 5: Test
1. Refresh your profile page
2. The activation code should now load successfully! ✅

---

## Alternative: Using Vercel CLI

If you prefer command line:

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Add environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SUPABASE_ANON_KEY

# Redeploy
vercel --prod
```

---

## ✅ Success Indicators

After redeployment, you should see:
- ✅ Profile page loads without errors
- ✅ Activation code displays or "Generate Code" button appears
- ✅ No "Server configuration error" in console
- ✅ Credits display correctly

---

## 🎯 What This Fixes

Adding these 3 environment variables will fix:
- ✅ Profile page activation code generation
- ✅ Desktop app activation
- ✅ Credits tracking and sync
- ✅ User authentication on serverless functions
- ✅ Free credits (FREEDOM coupon)

---

## 📞 Still Not Working?

Check deployment logs:
1. Vercel Dashboard → Deployments
2. Click latest deployment
3. Click **"View Function Logs"**
4. Look for any error messages

Common issues:
- ❌ Wrong Supabase URL format (must start with `https://`)
- ❌ Used anon key instead of service_role key
- ❌ Didn't redeploy after adding variables
- ❌ Selected wrong environment (make sure all 3 are selected)

---

**Time to Fix**: ~5 minutes
**Impact**: Fixes all activation and credits features
**Priority**: 🔴 CRITICAL - Must do this first
