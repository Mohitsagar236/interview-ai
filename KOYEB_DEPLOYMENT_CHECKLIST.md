# Koyeb Deployment Verification Checklist

## ✅ What We Just Fixed

1. **koyeb.yaml** - Updated port from 8765 → 8000 ✓
2. **Dockerfile** - Updated port from 8765 → 8000 ✓
3. **Pushed to GitHub** - Commit: 09c9a42 ✓

## 🔍 What to Check in Koyeb Dashboard

### Step 1: Check Deployment Status
Go to: https://app.koyeb.com/

1. Navigate to your service: **breakable-benny/interview-ai**
2. Look for the **Deployments** tab
3. You should see a new deployment triggered by your latest git push (09c9a42)
4. Wait for status to show **"Healthy"** (this may take 2-3 minutes)

### Step 2: Verify Environment Variables
Click on **Settings** → **Environment Variables**

**Required variables** (must all be set):
```
PORT=8000
HOST=0.0.0.0
CLOUD_MODE=true
ALLOWED_ORIGINS=*

OPENROUTER_API_KEY=<your-key>
DEEPGRAM_API_KEY=<your-key>

SUPABASE_URL=<your-url>
SUPABASE_ANON_KEY=<your-key>
SUPABASE_SERVICE_KEY=<your-key>

RAZORPAY_KEY_ID=<your-key>
RAZORPAY_KEY_SECRET=<your-key>
```

### Step 3: Check Build Logs
1. Click on **Deployments** → Select the latest deployment
2. Click **Build Logs** tab
3. Look for:
   - ✅ "Successfully built <image-id>"
   - ✅ "Successfully tagged"
   - ✅ No errors during build

### Step 4: Check Runtime Logs
1. Still in the deployment, click **Runtime Logs** tab
2. Look for:
   - ✅ "Server will listen on 0.0.0.0:8000"
   - ✅ "WebSocket server started on ws://0.0.0.0:8000"
   - ❌ Any error messages or crashes

### Step 5: Check Health Checks
1. In **Settings** → **Health Checks**
2. Verify:
   - Protocol: **HTTP**
   - Port: **8000**
   - Path: **/health**
   - Grace Period: **90 seconds** (recommended)

### Step 6: Verify Custom Domain
1. In **Settings** → **Domains**
2. Verify: **api.interviewai.space** points to your service
3. Status should show **"Active"** with a green checkmark

## 🧪 Testing Backend Connection

### Test 1: Health Check Endpoint
```powershell
curl.exe https://api.interviewai.space/health
```
Expected: `{"status": "healthy"}` or similar

### Test 2: WebSocket Connection
Open your desktop app and try to:
- Start an interview
- Speak something and check if it transcribes
- Ask AI a question and check for response

### Test 3: TCP Connection
```powershell
Test-NetConnection -ComputerName api.interviewai.space -Port 443
```
Expected: `TcpTestSucceeded: True`

## 🚨 Common Issues and Solutions

### Issue: "No active service" error
**Solution:** Service hasn't deployed yet. Wait 2-3 minutes and check deployment status.

### Issue: Build fails
**Solution:** 
- Check Build Logs for specific error
- Verify Dockerfile syntax
- Ensure python/requirements-cloud.txt exists

### Issue: Runtime crashes
**Solution:**
- Check Runtime Logs for Python errors
- Verify all environment variables are set
- Check if OPENROUTER_API_KEY and DEEPGRAM_API_KEY are valid

### Issue: Health check fails
**Solution:**
- Ensure your Python server has a `/health` endpoint
- Verify PORT=8000 in environment variables
- Increase health check grace period to 120 seconds

### Issue: WebSocket connection fails from desktop app
**Solution:**
- Verify custom domain (api.interviewai.space) is active
- Check electron/config.js has `wss://api.interviewai.space`
- Reinstall desktop app after rebuilding

## 📊 Expected Timeline

| Time | Status |
|------|--------|
| 0 min | Git push completed |
| 1 min | Koyeb detects changes, starts build |
| 2-3 min | Docker build completes |
| 3-4 min | Container starts, health checks begin |
| 4-5 min | Service shows "Healthy" |
| 5+ min | Backend fully operational |

## ✅ Success Indicators

When everything is working:

1. ✅ Koyeb dashboard shows "Healthy" status with green indicator
2. ✅ Runtime logs show "WebSocket server started on ws://0.0.0.0:8000"
3. ✅ `curl https://api.interviewai.space/health` returns success
4. ✅ Desktop app connects and can transcribe speech
5. ✅ AI responses work in the desktop app

## 📝 Next Steps After Deployment

Once backend is healthy:
1. Test desktop app thoroughly
2. Test all features (speech, AI responses, screen capture)
3. If everything works, you're done! 🎉
4. If issues persist, check Runtime Logs and share error messages

---

**Current Status:** Waiting for Koyeb to redeploy with port 8000 configuration.
**Last Update:** Dockerfile and koyeb.yaml both updated to use port 8000
**Commit:** 09c9a42
