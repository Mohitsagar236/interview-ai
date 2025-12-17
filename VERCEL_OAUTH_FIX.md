# Fix OAuth Redirect to Localhost on Vercel

## Problem
After deploying to Vercel, Google OAuth redirects back to `localhost:3000` instead of your Vercel domain.

## Root Cause
Supabase needs your Vercel domain added to the allowed redirect URLs in **two places**:
1. Supabase Dashboard (Site URLs)
2. Google Cloud Console (Authorized redirect URIs)

---

## Solution: Add Your Vercel Domain

### Step 1: Get Your Vercel Domain
Your app is deployed at one of these:
- `https://your-app.vercel.app` (automatic Vercel domain)
- `https://yourdomain.com` (custom domain if configured)

Example: `https://interview-ai-xyz123.vercel.app`

---

### Step 2: Update Supabase Dashboard

1. Go to: https://app.supabase.com/project/npdysfxewryqcmmztdxl/auth/url-configuration

2. **Site URL** - Add your Vercel domain:
   ```
   https://your-app.vercel.app
   ```

3. **Redirect URLs** - Add these (one per line):
   ```
   https://your-app.vercel.app/auth.html
   https://your-app.vercel.app/profile.html
   https://your-app.vercel.app/**
   http://localhost:3000/auth.html
   http://localhost:3000/profile.html
   ```
   
   Note: Keep localhost URLs for local development

4. Click **Save**

---

### Step 3: Update Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials

2. Click on your OAuth 2.0 Client ID

3. Under **Authorized redirect URIs**, add:
   ```
   https://npdysfxewryqcmmztdxl.supabase.co/auth/v1/callback
   ```
   (This should already be there, but verify it)

4. Under **Authorized JavaScript origins**, add:
   ```
   https://your-app.vercel.app
   http://localhost:3000
   ```

5. Click **Save**

---

### Step 4: Test on Vercel

1. Visit: `https://your-app.vercel.app/auth.html`
2. Click "Continue with Google"
3. After Google login, it should redirect to: `https://your-app.vercel.app/auth.html#access_token=...`
4. Then automatically redirect to your profile page

---

## Quick Fix Script

Run this in PowerShell to get your Vercel domain:

```powershell
# Get your Vercel deployment URL
vercel --prod

# Or check your latest deployment
vercel ls
```

---

## Environment Variables (Optional)

If you want to explicitly set the production URL, add to Vercel:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables

2. Add:
   ```
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```

3. Redeploy

Then update code to use it:
```javascript
const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
```

---

## Verify Configuration

### Check Supabase URLs:
```bash
# Should include your Vercel domain
✅ Site URL: https://your-app.vercel.app
✅ Redirect URLs include: https://your-app.vercel.app/auth.html
```

### Check Google Console:
```bash
✅ Authorized redirect URIs include Supabase callback
✅ Authorized origins include your Vercel domain
```

---

## Still Not Working?

### Clear Browser Cache
Sometimes the old localhost redirect is cached:
1. Open DevTools (F12)
2. Right-click refresh button → "Empty Cache and Hard Reload"
3. Try OAuth again

### Check Supabase Logs
1. Go to: https://app.supabase.com/project/npdysfxewryqcmmztdxl/logs/auth-logs
2. Look for redirect errors
3. Verify the redirect_uri in the logs matches your Vercel domain

### Force HTTPS
Make sure your Vercel app URL uses HTTPS (not HTTP)

---

## Multiple Domains Support

If you have multiple domains (staging, production, etc.):

### Supabase Redirect URLs:
```
https://interview-ai-staging.vercel.app/auth.html
https://interview-ai-production.vercel.app/auth.html
https://yourdomain.com/auth.html
http://localhost:3000/auth.html
```

### Google Console Origins:
```
https://interview-ai-staging.vercel.app
https://interview-ai-production.vercel.app
https://yourdomain.com
http://localhost:3000
```

---

## Code is Already Fixed ✅

The code already uses `window.location.origin` dynamically:

```javascript
// auth.js (line ~425)
const currentOrigin = window.location.origin; // Works on any domain!
const callbackUrl = `${currentOrigin}/auth.html`;
```

So **NO code changes needed** - just update Supabase and Google Console settings!

---

## Summary Checklist

- [ ] Get your Vercel domain URL
- [ ] Add Vercel domain to Supabase Site URL
- [ ] Add Vercel auth.html to Supabase Redirect URLs
- [ ] Add Vercel domain to Google Authorized JavaScript origins
- [ ] Test OAuth on Vercel
- [ ] Clear browser cache if needed

**Estimated time: 5 minutes**

---

## Support

If you still see localhost after following these steps:
1. Double-check all URLs are saved in Supabase
2. Wait 1-2 minutes for changes to propagate
3. Clear browser cache completely
4. Try incognito/private browsing mode
