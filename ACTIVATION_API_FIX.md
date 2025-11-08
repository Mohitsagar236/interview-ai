# 🚨 Desktop App Activation Error Fix

## Problem
Your desktop app is trying to activate using the code `WEZE-HCQ7-BTWD-PHV6`, but it's getting "Invalid JSON response" because the activation API at `https://interviewai.space/api/activation` is blocked by Vercel's security checkpoint.

## Root Cause
- Desktop app calls: `https://interviewai.space/api/activation?action=activate`
- Vercel returns a security checkpoint page instead of JSON
- The desktop app can't parse HTML as JSON, causing the error

## Solution Options

### ✅ Option 1: Redeploy to Vercel (RECOMMENDED)

Your website needs to be properly deployed to Vercel with the API endpoints.

1. **Login to Vercel**
   ```powershell
   npx vercel login
   ```

2. **Deploy your website**
   ```powershell
   npx vercel --prod
   ```

3. **Verify the deployment**
   - Go to https://vercel.com/dashboard
   - Check that your project is deployed
   - Test: `https://interviewai.space/api/activation?action=activate`

### ⚡ Option 2: Use Local Development Mode (QUICK TEST)

For immediate testing, you can run the website locally:

1. **Start the local server**
   ```powershell
   cd c:\Users\cp813\Desktop\interview-ai
   npm install
   npm run dev
   ```

2. **Update electron config temporarily**
   - The desktop app will use `http://localhost:3000` for activation when not packaged
   - This bypasses Vercel entirely

3. **Run the desktop app from source**
   ```powershell
   npm run electron
   ```

### 🔧 Option 3: Bypass Activation (FOR TESTING ONLY)

Temporarily skip activation to test other features:

**File**: `electron/desktop-activation-manager.js`

Find the `isActivated()` method (line ~32) and temporarily change it:

```javascript
// TEMPORARY - FOR TESTING ONLY
isActivated() {
    return true; // Always return true to bypass activation
}
```

**WARNING**: This bypasses all credit checks. Only use for testing the app's other features.

---

## Recommended Immediate Steps

### Step 1: Check Vercel Deployment

```powershell
# Test if the API is responding
curl.exe https://interviewai.space/api/hello.py
```

If you get HTML instead of JSON, the API isn't deployed.

### Step 2: Redeploy to Vercel

```powershell
# Install Vercel CLI if not installed
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Step 3: Test Activation API

```powershell
# Test the activation endpoint
curl.exe -X POST "https://interviewai.space/api/activation?action=activate" `
  -H "Content-Type: application/json" `
  -d '{\"code\":\"TEST-CODE-1234-5678\",\"deviceInfo\":{\"platform\":\"win32\"}}'
```

Should return JSON, not HTML.

### Step 4: Test Desktop App

Once the API is working:
1. Launch the desktop app
2. Enter activation code: `WEZE-HCQ7-BTWD-PHV6`
3. Click "Activate Desktop App"
4. Should connect successfully

---

## Why This Happened

1. **Vercel Security Checkpoint**: Vercel detected unusual traffic or needs to verify requests
2. **API Not Deployed**: The `/api` folder might not be properly deployed to Vercel
3. **CORS Issues**: The API might not be configured to accept requests from Electron apps

## Long-Term Fix

### Ensure Vercel Configuration

Your `vercel.json` looks correct:
```json
{
  "routes": [
    {
      "src": "/api/activation",
      "dest": "/api/activation.js"
    }
  ]
}
```

### Check Supabase Environment Variables

Make sure these are set in Vercel dashboard:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`

### Verify API File Exists

Confirm `api/activation.js` exists and is properly committed to your git repository.

---

## Testing Checklist

- [ ] Vercel deployment successful
- [ ] API endpoint returns JSON (not HTML)
- [ ] Activation code works in desktop app
- [ ] Credits are tracked correctly
- [ ] Backend (Koyeb) connects successfully

---

## Need Help?

If Vercel continues to block requests:
1. Check Vercel dashboard for deployment errors
2. Review Vercel logs for 500/400 errors
3. Contact Vercel support about security checkpoint
4. Consider hosting the API on a different platform (e.g., Railway, Render)

---

**Current Status**: Activation API blocked by Vercel security checkpoint
**Next Action**: Deploy to Vercel or run locally for testing
