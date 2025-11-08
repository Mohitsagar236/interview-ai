# 🔧 Desktop App Connection to Koyeb Backend - Complete Fix

## Problem
Desktop app not connecting to Koyeb-deployed backend

## ✅ Files Updated
1. `electron/config.js` - Updated production serverUrl
2. `electron/desktop-auth-manager.js` - Fixed API URL detection

---

## 🚀 Step-by-Step Fix

### Step 1: Get Your Koyeb URLs

You need TWO URLs from your Koyeb deployment:

#### A. WebSocket URL (for Python backend)
1. Go to: https://app.koyeb.com/
2. Find your `interview-ai-backend` service
3. Copy the public URL (e.g., `my-app-abc123.koyeb.app`)
4. **Format for config**: `wss://YOUR-APP.koyeb.app` (note: `wss://` not `https://`)

#### B. Web API URL (already set to interviewai.space)
- ✅ Already configured: `https://interviewai.space`

---

### Step 2: Update electron/config.js

Open `electron/config.js` and replace line 20:

**Find this:**
```javascript
serverUrl: process.env.SERVER_URL || 'wss://YOUR-KOYEB-URL-HERE.koyeb.app',
```

**Replace with your actual Koyeb URL:**
```javascript
serverUrl: process.env.SERVER_URL || 'wss://interview-ai-backend-yourorg.koyeb.app',
```

**Example:** If your Koyeb URL is `my-app-abc123.koyeb.app`, use:
```javascript
serverUrl: process.env.SERVER_URL || 'wss://my-app-abc123.koyeb.app',
```

---

### Step 3: Verify Koyeb Backend is Running

#### A. Check Koyeb Dashboard
1. Go to https://app.koyeb.com/
2. Ensure service status is "Healthy" (green)
3. Check logs for any errors

#### B. Test WebSocket Connection
Open browser console and run:
```javascript
const ws = new WebSocket('wss://YOUR-KOYEB-URL.koyeb.app');
ws.onopen = () => console.log('✅ Connected!');
ws.onerror = (err) => console.log('❌ Error:', err);
```

#### C. Test Health Endpoint
```bash
curl https://YOUR-KOYEB-URL.koyeb.app/health
```
Should return: `{"status": "healthy"}`

---

### Step 4: Rebuild Desktop App

After updating the config, rebuild your app:

```powershell
# For development testing
npm run start

# For production build
npm run build:prod
```

---

### Step 5: Check Environment Variables in Koyeb

Make sure these are set in Koyeb dashboard:

#### Required Variables:
```
CLOUD_MODE=true
PORT=8765
HOST=0.0.0.0
ALLOWED_ORIGINS=*
```

#### API Keys (Required):
```
OPENAI_API_KEY=your_key_here
DEEPGRAM_API_KEY=your_key_here
DEFAULT_LLM=openai/gpt-4
```

#### Database (Required):
```
SUPABASE_URL=your_url_here
SUPABASE_KEY=your_key_here
```

---

## 🔍 Troubleshooting

### Issue 1: "Connection Failed" or "WebSocket Error"

**Possible Causes:**
- Koyeb backend not running
- Wrong URL in config.js
- Port 8765 not exposed in Koyeb

**Solution:**
1. Check Koyeb service is "Healthy"
2. Verify URL format is `wss://` (secure websocket)
3. Check Koyeb logs for errors
4. Ensure port 8765 is configured in `koyeb.yaml`

### Issue 2: "502 Bad Gateway"

**Cause:** Backend not responding

**Solution:**
1. Check Koyeb logs
2. Verify Python server is starting correctly
3. Check environment variables are set
4. Restart Koyeb service

### Issue 3: "CORS Error"

**Cause:** ALLOWED_ORIGINS not set correctly

**Solution:**
Set in Koyeb environment variables:
```
ALLOWED_ORIGINS=*
```

Or for specific domain:
```
ALLOWED_ORIGINS=https://interviewai.space
```

### Issue 4: "Authentication Failed"

**Cause:** API endpoint URLs mismatch

**Solution:**
- ✅ `desktop-auth-manager.js` already updated to use `interviewai.space`
- ✅ `desktop-activation-manager.js` already updated to use `interviewai.space`
- Make sure your web API is deployed at `https://interviewai.space`

---

## 📋 Complete Checklist

### Koyeb Backend Setup:
- [ ] Backend deployed to Koyeb
- [ ] Service status is "Healthy"
- [ ] Public URL copied (e.g., `my-app.koyeb.app`)
- [ ] Environment variables set:
  - [ ] CLOUD_MODE=true
  - [ ] PORT=8765
  - [ ] HOST=0.0.0.0
  - [ ] ALLOWED_ORIGINS=*
  - [ ] OPENAI_API_KEY (set)
  - [ ] DEEPGRAM_API_KEY (set)
  - [ ] SUPABASE_URL (set)
  - [ ] SUPABASE_KEY (set)

### Desktop App Configuration:
- [x] `electron/config.js` updated with Koyeb URL
- [x] `electron/desktop-auth-manager.js` updated
- [ ] Desktop app rebuilt
- [ ] Tested connection

### Web API (interviewai.space):
- [ ] Deployed and accessible
- [ ] `/api/activation` endpoint working
- [ ] `/api/auth` endpoints working
- [ ] Database connected

---

## 🧪 Testing Connection

### Test 1: Health Check
```powershell
curl https://YOUR-KOYEB-URL.koyeb.app/health
```
Expected: `{"status": "healthy"}`

### Test 2: WebSocket (Browser Console)
```javascript
const ws = new WebSocket('wss://YOUR-KOYEB-URL.koyeb.app');
ws.onopen = () => console.log('✅ Connected!');
ws.onclose = () => console.log('❌ Disconnected');
ws.onerror = (e) => console.log('❌ Error:', e);
```

### Test 3: Desktop App
1. Open desktop app
2. Check console/logs for connection messages
3. Should see: "Connected to backend" or similar
4. Try using a feature (speech recognition, etc.)

---

## 📝 Example Configuration

### koyeb.yaml (already correct)
```yaml
services:
  - name: backend
    ports:
      - port: 8765
        protocol: http
    env:
      - name: CLOUD_MODE
        value: "true"
      - name: PORT
        value: "8765"
      - name: HOST
        value: "0.0.0.0"
```

### electron/config.js (UPDATE THIS)
```javascript
production: {
  serverUrl: 'wss://YOUR-ACTUAL-KOYEB-URL.koyeb.app',  // ← UPDATE THIS
  useLocalServer: false,
  cloudMode: true,
  enableDevTools: false,
  logLevel: 'info'
}
```

---

## 🆘 Still Not Working?

### Get More Info:

1. **Check Koyeb Logs:**
   ```
   Koyeb Dashboard → Your Service → Logs
   ```

2. **Check Desktop App Logs:**
   - Windows: `%APPDATA%\interview-ai-assistant\logs`
   - Mac: `~/Library/Logs/interview-ai-assistant`
   - Or run: `npm run start` and check console

3. **Test Each Component:**
   - Koyeb backend: `curl https://YOUR-URL.koyeb.app/health`
   - Web API: `curl https://interviewai.space/api/health`
   - Database: Check Supabase dashboard

4. **Common Issues:**
   - Forgot to set environment variables in Koyeb
   - Used `https://` instead of `wss://` for WebSocket
   - Koyeb service crashed (check logs)
   - Desktop app not rebuilt after config change

---

## 🎯 Quick Summary

**What needs your Koyeb URL:**
1. `electron/config.js` - Line 20 - WebSocket URL (`wss://`)

**What uses interviewai.space:**
1. `electron/desktop-auth-manager.js` - ✅ Already updated
2. `electron/desktop-activation-manager.js` - ✅ Already updated

**Your Action:**
1. Get Koyeb URL from dashboard
2. Update `electron/config.js` line 20
3. Rebuild desktop app: `npm run build:prod`
4. Test connection

---

## ✅ Success Indicators

When everything works, you should see:
- ✅ Koyeb service: "Healthy" status
- ✅ Desktop app: "Connected to backend"
- ✅ Speech recognition works
- ✅ AI responses work
- ✅ No connection errors in logs

---

**Good luck! 🚀**

If you're still stuck, share:
1. Your Koyeb URL
2. Koyeb logs (last 50 lines)
3. Desktop app error messages
