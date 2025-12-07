# 🔴 URGENT: Koyeb Service Not Publicly Accessible

## Current Problem

Your Koyeb backend is **running** but **not publicly accessible**. The logs show:

```
Private Address: interview-ai.breakable-benny.internal:8000
connection rejected (200 OK)
```

This means the service is only accessible internally, not from your desktop app.

## Solution: Expose Service Publicly

### Step 1: Check Service Exposure in Koyeb Dashboard

1. Go to your Koyeb service: **interview-ai**
2. Click on **Settings** tab
3. Look for **"Expose"** or **"Public Port"** settings

### Step 2: Make Port 8000 Public

In the Koyeb dashboard:

1. Go to **Settings** → **Ports**
2. Find port `8000`
3. Make sure it's set to **PUBLIC** (not private)
4. Save changes

### Step 3: Get Your Public URL

After making the port public, Koyeb will assign a public URL like:

```
https://interview-ai-<unique-id>.koyeb.app
```

**NOT** the old URL:
```
❌ https://interview-ai-backend-mohitsagar236.koyeb.app (This is wrong!)
```

### Step 4: Update Desktop App Config

Once you have the correct public URL, update `electron/config.js`:

```javascript
// Replace BOTH occurrences with your actual Koyeb public URL
serverUrl: 'wss://interview-ai-<your-actual-id>.koyeb.app'
```

## Alternative: Use Koyeb's Auto-Generated URL

The service name in Koyeb dashboard shows as just **"interview-ai"**, not "interview-ai-backend-mohitsagar236".

Your actual public URL is probably one of these:
- `https://interview-ai.koyeb.app`
- `https://interview-ai-<app-id>.koyeb.app`

### Find Your Real URL:

1. **In Koyeb Dashboard:**
   - Go to your service
   - Look for **"Public Endpoints"** or **"Domains"** section
   - Copy the HTTPS URL shown there

2. **Test it:**
   ```powershell
   # Replace with actual URL from dashboard
   Invoke-WebRequest -Uri "https://YOUR-ACTUAL-URL/health"
   ```

## Quick Fix in Koyeb Dashboard

### Option A: Use Custom Domain (Recommended)

1. In Koyeb dashboard, go to your service
2. Click **"Domains"** or **"Public Access"**
3. Add custom domain: `interview-ai-backend-mohitsagar236.koyeb.app`
4. This will make your old URL work!

### Option B: Use Auto-Generated URL

1. In Koyeb dashboard, find the auto-generated public URL
2. Copy it
3. Update `electron/config.js` with that URL
4. Rebuild the desktop app

## Expected Koyeb Dashboard Settings

Your service should show:

```
✅ Service: interview-ai
✅ Status: Healthy
✅ Instance: 1/1 running
✅ Public URL: https://interview-ai-XXXXX.koyeb.app <-- COPY THIS!
✅ Port 8000: PUBLIC (not private)
✅ Protocol: HTTP (Koyeb will handle SSL upgrade)
```

## Test Connection

After fixing the public URL:

```powershell
# Test health endpoint
$url = "https://YOUR-ACTUAL-PUBLIC-URL/health"
Invoke-WebRequest -Uri $url
# Should return 200 OK with "Backend server is healthy"

# Test WebSocket endpoint  
# (You can't test WSS easily from PowerShell, but the app will)
```

## Critical Configuration Check

Make sure in Koyeb dashboard env vars you have:

```
CLOUD_MODE=true
HOST=0.0.0.0       <-- Must bind to all interfaces
PORT=8000
ALLOWED_ORIGINS=*  <-- Allow all origins for now
```

## After Getting Public URL

1. **Update electron/config.js** with real URL
2. **Update .env** (optional, for dev mode)
3. **Rebuild app:** `npm run build:prod`
4. **Or run in dev:** `npm start`

---

## Summary

**Current Issue:** Service is running but only accessible internally

**Root Cause:** Port 8000 is not exposed publicly OR you're using wrong URL

**Fix:**
1. Make port 8000 public in Koyeb dashboard
2. Get the real public URL from dashboard  
3. Update `electron/config.js` with correct URL
4. Desktop app will connect!

The backend IS working - it just needs to be publicly accessible! 🚀
