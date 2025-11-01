# Quick Start: Deploying Your Interview AI App to the Cloud

This guide will help you migrate from a local-only desktop app to a cloud-based architecture in **~30 minutes**.

---

## 📋 **Prerequisites**

- [ ] GitHub account
- [ ] Render.com account (free tier works)
- [ ] Your existing `.env` file with API keys
- [ ] Git installed and repository pushed to GitHub

---

## 🚀 **Step-by-Step Deployment**

### **Step 1: Deploy Backend to Render (10 minutes)**

1. **Sign up for Render.com**
   - Go to https://render.com
   - Sign in with your GitHub account

2. **Create a new Web Service**
   - Click "New +" → "Web Service"
   - Connect your `interview-ai` repository
   - Render will auto-detect `render.yaml` configuration

3. **Configure Environment Variables**
   - In Render Dashboard, go to your service → "Environment" tab
   - Add these secrets (from your `.env` file):
     ```
     OPENAI_API_KEY=sk-...
     ANTHROPIC_API_KEY=sk-ant-...
     GROQ_API_KEY=gsk_...
     DEEPGRAM_API_KEY=...
     OPENROUTER_API_KEY=sk-or-...
     ```

4. **Wait for Deployment** (~5 minutes)
   - Render will install dependencies and start your server
   - Watch the logs for: `✅ Server ready at ws://0.0.0.0:8765`

5. **Copy Your Service URL**
   - It will look like: `https://interview-ai-backend-xxxx.onrender.com`
   - **Important**: Change `https://` to `wss://` for WebSocket connections
   - Example: `wss://interview-ai-backend-xxxx.onrender.com`

---

### **Step 2: Update Electron App (5 minutes)**

1. **Update `electron/config.js`**
   - Open the file
   - Find line 17: `serverUrl: process.env.SERVER_URL || 'wss://your-backend.onrender.com'`
   - Replace with YOUR Render URL:
     ```javascript
     serverUrl: process.env.SERVER_URL || 'wss://interview-ai-backend-xxxx.onrender.com'
     ```

2. **Verify Configuration**
   ```powershell
   # Check the config file
   cat electron/config.js
   ```

---

### **Step 3: Update Backend for Cloud (5 minutes)**

The backend needs a small modification to accept cloud connections:

1. **Open `python/server.py`**

2. **Find the `main()` function** (around line 3500)

3. **Update the server initialization**:
   
   **Before:**
   ```python
   async with websockets.serve(
       handle_ui,
       "localhost",
       8765,
   ```
   
   **After:**
   ```python
   import os
   
   # At the top of main()
   CLOUD_MODE = os.getenv('CLOUD_MODE', 'false').lower() == 'true'
   HOST = '0.0.0.0' if CLOUD_MODE else 'localhost'
   PORT = int(os.getenv('PORT', 8765))
   
   async with websockets.serve(
       handle_ui,
       HOST,
       PORT,
   ```

4. **Commit and push changes**:
   ```powershell
   git add python/server.py
   git commit -m "Add cloud mode support"
   git push
   ```

5. **Render will auto-deploy** your changes in ~2 minutes

---

### **Step 4: Build Production Electron App (5 minutes)**

1. **Set environment variable for production build**:
   ```powershell
   $env:NODE_ENV="production"
   ```

2. **Build the app**:
   ```powershell
   npm run build
   ```

3. **Find the installer**:
   - Windows: `dist/Interview AI Assistant Setup.exe`
   - The app is now configured to connect to your cloud backend!

---

### **Step 5: Test the Cloud Setup (5 minutes)**

1. **Install the app on a test machine** (or your own)

2. **Launch the app**

3. **Check connection status**:
   - Look for the green "Connected" indicator
   - Open DevTools (Ctrl+Shift+I) and check console:
     ```
     [CONFIG] Running in production mode
     [CONFIG] Server URL: wss://interview-ai-backend-xxxx.onrender.com
     [CONFIG] Cloud Mode: true
     Connected to cloud server: wss://...
     ```

4. **Test functionality**:
   - [ ] Record interviewer (transcription works)
   - [ ] Capture screen (OCR works)
   - [ ] Ask AI question (LLM responds)
   - [ ] Upload resume (embedding works)

---

## ✅ **Verification Checklist**

After deployment, verify:

- [ ] Backend deployed successfully on Render
- [ ] WebSocket URL copied and updated in `electron/config.js`
- [ ] Environment variables set in Render Dashboard
- [ ] Electron app built with `NODE_ENV=production`
- [ ] App connects to cloud backend (green status indicator)
- [ ] Transcription works (Deepgram API called from cloud)
- [ ] AI responses work (OpenAI/Anthropic called from cloud)
- [ ] OCR works (Tesseract runs on cloud server)

---

## 🐛 **Troubleshooting**

### **App shows "Disconnected"**

**Cause**: Can't connect to cloud backend

**Solution**:
1. Check Render service is running (not sleeping on free tier)
2. Verify URL in `electron/config.js` uses `wss://` not `ws://`
3. Check browser console for WebSocket errors
4. Test backend URL manually:
   ```powershell
   # Install websocat for testing
   websocat wss://interview-ai-backend-xxxx.onrender.com/ui
   ```

### **Backend crashes on Render**

**Cause**: Missing dependencies or environment variables

**Solution**:
1. Check Render logs for errors
2. Verify all required env vars are set
3. Ensure `python/requirements.txt` has all dependencies
4. Check if Tesseract is installed (add to `render.yaml` if needed)

### **Transcription doesn't work**

**Cause**: Deepgram API key not set or invalid

**Solution**:
1. Verify `DEEPGRAM_API_KEY` in Render environment variables
2. Check Deepgram dashboard for API quota/usage
3. Test API key:
   ```powershell
   curl -X POST https://api.deepgram.com/v1/listen ^
     -H "Authorization: Token YOUR_KEY" ^
     -H "Content-Type: audio/wav" ^
     --data-binary @test.wav
   ```

### **AI responses fail**

**Cause**: LLM API keys not configured

**Solution**:
1. Add API keys to Render environment variables
2. Restart the service after adding keys
3. Check Render logs for API errors

---

## 💰 **Cost Breakdown**

### **Free Tier (Perfect for Testing)**
- **Render Free**: 750 hours/month
  - ⚠️ Spins down after 15 minutes of inactivity
  - ⚠️ Cold starts take ~30 seconds
- **Total**: $0/month

### **Recommended Production Setup**
- **Render Starter**: $7/month
  - ✅ Always-on (no cold starts)
  - ✅ 1GB RAM
  - ✅ Custom domain support
- **Total**: $7/month

### **Scale-Up (100+ concurrent users)**
- **Render Standard**: $25/month
  - ✅ 4GB RAM
  - ✅ Auto-scaling
  - ✅ Better performance
- **Total**: $25/month

---

## 🔐 **Security Recommendations**

### **For Production Release:**

1. **Add API Authentication**
   - Generate unique API keys per user
   - Validate keys in `python/server.py`
   - Store keys securely in Electron app

2. **Limit CORS Origins**
   - Update `ALLOWED_ORIGINS` in Render to your website domain only
   - Remove `*` wildcard

3. **Rate Limiting**
   - Add rate limiting to prevent abuse
   - Use Redis or in-memory store for tracking

4. **HTTPS/WSS Only**
   - Ensure all connections use WSS (encrypted WebSockets)
   - No plain WS in production

5. **Monitor Usage**
   - Set up Sentry for error tracking
   - Monitor API costs (OpenAI, Deepgram)
   - Set up alerts for unusual activity

---

## 📈 **Next Steps After Cloud Deployment**

1. **Update Website Download Link**
   - Point users to download the cloud-enabled build
   - Update `public/index.html` download section

2. **Create User Onboarding**
   - First-time setup wizard
   - API key configuration UI
   - Connection testing

3. **Add Analytics**
   - Track usage patterns
   - Monitor connection health
   - Identify popular features

4. **Set Up Monitoring**
   - Uptime monitoring (UptimeRobot, Better Uptime)
   - Error tracking (Sentry)
   - Performance monitoring (Render metrics)

5. **Plan for Scaling**
   - Consider CDN for static assets
   - Database for user data (PostgreSQL on Render)
   - Redis for caching (Render Redis add-on)

---

## 🆘 **Get Help**

- **Render Support**: https://render.com/docs/support
- **WebSocket Testing**: Use `websocat` or `wscat`
- **Logs**: Check Render Dashboard → Your Service → Logs

---

## 📝 **Summary**

You've successfully:
- ✅ Deployed Python backend to Render cloud
- ✅ Updated Electron app to connect to cloud
- ✅ Built production-ready installer
- ✅ Tested cloud connectivity

**Your app is now cloud-powered!** 🎉

Users can download and use it without running Python locally. All processing happens on your cloud backend.

