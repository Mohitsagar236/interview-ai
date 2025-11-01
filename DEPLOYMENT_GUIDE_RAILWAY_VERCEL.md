# 🚀 DEPLOYMENT GUIDE: Railway + Vercel

**Backend:** Railway.app  
**Website:** Vercel.com  
**Estimated Time:** 20 minutes

---

## 📋 PREREQUISITES

- [x] GitHub account
- [x] Railway account (sign up at https://railway.app)
- [x] Vercel account (sign up at https://vercel.com)
- [x] API Keys ready:
  - OpenAI API key
  - Deepgram API key
  - Anthropic API key (optional)
  - Groq API key (optional)

---

## 🔴 PART 1: DEPLOY BACKEND TO RAILWAY (10 min)

### Step 1: Push Code to GitHub
```powershell
# Commit all changes
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### Step 2: Deploy to Railway

1. **Go to Railway:** https://railway.app
2. **Sign in** with GitHub
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose:** `Mohitsagar236/interview-ai`
6. **Railway auto-detects** `railway.json` ✅

### Step 3: Configure Environment Variables

Click **"Variables"** tab and add:

```bash
# Required
CLOUD_MODE=true
PORT=8765
HOST=0.0.0.0
ALLOWED_ORIGINS=*

# AI Services
OPENAI_API_KEY=sk-proj-...
DEEPGRAM_API_KEY=...
DEFAULT_LLM=gpt-4o-mini

# Optional AI Providers
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# Transcription Settings
USE_STREAMING_TRANSCRIPTION=true
STREAMING_PROVIDER=deepgram
DEEPGRAM_MODEL=nova-2

# AI Settings
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=500
ENABLE_STREAMING_RESPONSE=true
```

### Step 4: Get Your Railway URL

1. **Wait for deployment** (~3-5 minutes)
2. **Copy your Railway URL** from the deployment page
   - Format: `https://interview-ai-backend-production-xxxx.up.railway.app`
3. **Your WebSocket URL will be:**
   - `wss://interview-ai-backend-production-xxxx.up.railway.app`

### Step 5: Test Backend Health

Open in browser:
```
https://your-railway-app.up.railway.app/health
```

Should return:
```json
{
  "status": "ok",
  "cloud_mode": true,
  "ai_providers": ["openai", "deepgram"]
}
```

✅ **Backend deployed!**

---

## 🌐 PART 2: DEPLOY WEBSITE TO VERCEL (5 min)

### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to Vercel:** https://vercel.com
2. **Sign in** with GitHub
3. **Click "Add New..." → "Project"**
4. **Import:** `Mohitsagar236/interview-ai`
5. **Configure Project:**
   - **Framework Preset:** Other
   - **Root Directory:** `public`
   - **Build Command:** Leave empty
   - **Output Directory:** Leave as `public`
6. **Click "Deploy"**
7. **Wait 1-2 minutes**
8. **Your website:** `https://interview-ai.vercel.app`

### Option B: Deploy via CLI

```powershell
# Install Vercel CLI (one time)
npm install -g vercel

# Deploy
npm run vercel:deploy

# Follow prompts:
# - Set up and deploy: Yes
# - Scope: Your account
# - Link to existing project: No
# - Project name: interview-ai
# - Directory: ./public
# - Override settings: No

# Production deployment
vercel --prod
```

✅ **Website deployed!**

---

## 🔧 PART 3: UPDATE ELECTRON APP CONFIG (2 min)

### Update Backend URL

Edit `electron/config.js` line 18:

```javascript
production: {
  // Replace with your actual Railway URL
  serverUrl: 'wss://interview-ai-backend-production-xxxx.up.railway.app',
  cloudMode: true,
  // ...
}
```

**Example:**
```javascript
serverUrl: 'wss://interview-ai-backend-production-a1b2c3.up.railway.app',
```

---

## 📦 PART 4: BUILD PRODUCTION APP (5 min)

### Build Cloud-Connected Installer

```powershell
# Build production app (connects to Railway)
npm run build:prod

# Output: dist/Interview AI Assistant Setup 0.1.0.exe
```

### Upload to Website

```powershell
# Copy installer to public folder
Copy-Item "dist\Interview AI Assistant Setup 0.1.0.exe" "public\downloads\"

# Commit and push
git add public/downloads/
git commit -m "Add production installer"
git push

# Vercel auto-deploys the update!
```

---

## ✅ PART 5: TEST EVERYTHING (5 min)

### Test 1: Backend Health Check
```
✓ Visit: https://your-railway-app.up.railway.app/health
✓ Should show: {"status": "ok", "cloud_mode": true}
```

### Test 2: Website
```
✓ Visit: https://interview-ai.vercel.app
✓ Click download link
✓ Should download installer
```

### Test 3: Desktop App
```powershell
# Install the production build
.\dist\Interview AI Assistant Setup 0.1.0.exe

# Open app
# Check developer console (Ctrl+Shift+I if dev tools enabled)
# Should see:
# [CONFIG] Running in production mode
# [CONFIG] Server URL: wss://your-railway-app.up.railway.app
# [CONFIG] Cloud Mode: true
# [Cloud Mode] Connecting to cloud server
# [Cloud] ✅ Connected
```

### Test 4: Full Workflow
```
✓ Start interview recording
✓ Speak into microphone
✓ Verify transcription appears
✓ Ask AI a question
✓ Verify AI responds
✓ Try screen capture OCR
```

---

## 🎯 DEPLOYMENT CHECKLIST

- [ ] Code pushed to GitHub
- [ ] Backend deployed to Railway
- [ ] Environment variables added to Railway
- [ ] Railway health check passing
- [ ] Website deployed to Vercel
- [ ] `electron/config.js` updated with Railway URL
- [ ] Production app built with `npm run build:prod`
- [ ] Installer uploaded to website
- [ ] Desktop app tested and connects to cloud
- [ ] All features working (transcription, AI, OCR)

---

## 🔄 CONTINUOUS DEPLOYMENT

### Auto-Deploy Backend (Railway)
```
✓ Push to GitHub → Railway auto-deploys
✓ No manual steps needed!
```

### Auto-Deploy Website (Vercel)
```
✓ Push to GitHub → Vercel auto-deploys
✓ Changes live in ~1 minute!
```

### Update Desktop App
```powershell
# 1. Make changes to code
# 2. Bump version in package.json
# 3. Build production app
npm run build:prod

# 4. Upload new installer to website
Copy-Item "dist\*.exe" "public\downloads\"
git add public/downloads/
git commit -m "Update to v0.2.0"
git push

# Vercel auto-deploys new installer!
```

---

## 💰 COST BREAKDOWN

| Service | Purpose | Cost |
|---------|---------|------|
| **Railway** | Backend hosting | $5/month (Hobby plan) |
| **Vercel** | Website hosting | **FREE** (Personal) |
| **OpenAI API** | AI responses | ~$0.01/request |
| **Deepgram API** | Transcription | Free tier (45 hrs/month) |

**Total:** ~$5-10/month for unlimited users!

---

## 🛠️ RAILWAY-SPECIFIC SETTINGS

### Custom Domain (Optional)
1. Go to Railway project → Settings
2. Click "Generate Domain" or add custom domain
3. Update `ALLOWED_ORIGINS` in Railway variables:
   ```
   ALLOWED_ORIGINS=https://interview-ai.vercel.app,https://yourdomain.com
   ```

### Scaling (If Needed)
1. Railway project → Settings → Resources
2. Increase RAM/CPU as needed
3. Default (512MB RAM) handles ~100 concurrent users

### Logs & Monitoring
1. Railway project → Deployments
2. Click latest deployment → View Logs
3. Monitor WebSocket connections, errors, API usage

---

## 🚨 TROUBLESHOOTING

### Backend Not Connecting
```powershell
# Check Railway logs
railway logs

# Common issues:
# 1. CLOUD_MODE not set → Add to Railway variables
# 2. PORT mismatch → Should be 8765
# 3. ALLOWED_ORIGINS too restrictive → Try * for testing
```

### Website 404 on Vercel
```
# Check vercel.json is correct:
# Root Directory should be: public
# Or add vercel.json with rewrites
```

### App Stuck on "Connecting..."
```
# Check electron/config.js:
# 1. serverUrl matches Railway URL
# 2. cloudMode is true
# 3. Rebuild with: npm run build:prod
```

### WebSocket Connection Refused
```
# Railway firewall settings:
# 1. Railway project → Settings → Networking
# 2. Ensure WebSocket protocol enabled (default: yes)
# 3. Check ALLOWED_ORIGINS includes *
```

---

## 📊 YOUR DEPLOYMENT ARCHITECTURE

```
┌──────────────────────────────────────────┐
│  USERS VISIT WEBSITE                     │
│  https://interview-ai.vercel.app         │
│  (Hosted on Vercel - FREE)               │
│  ↓ Download installer                    │
└──────────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  ELECTRON APP (User's Computer)          │
│  Interview AI Assistant.exe              │
│  ↓ WebSocket connection                  │
└──────────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  BACKEND SERVER (Railway - $5/month)     │
│  wss://interview-ai-backend.railway.app  │
│  Python WebSocket server                 │
│  ↓ API calls                             │
└──────────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  AI SERVICES (Pay-per-use)               │
│  • OpenAI GPT-4o-mini                    │
│  • Deepgram (transcription)              │
└──────────────────────────────────────────┘
```

---

## 🎉 SUCCESS!

Your Interview AI app is now:
- ✅ Backend running on **Railway**
- ✅ Website hosted on **Vercel**
- ✅ Desktop app connecting to cloud
- ✅ Auto-deploys on git push
- ✅ Scalable to thousands of users!

**Total setup time:** 20 minutes  
**Monthly cost:** ~$5-10  
**Users supported:** Unlimited!

---

## 📚 NEXT STEPS

1. **Custom Domain:** Add your own domain to Vercel
2. **Analytics:** Add Google Analytics to website
3. **User Auth:** Implement API keys for user tracking
4. **Monitoring:** Set up Railway alerts for errors
5. **Backups:** Configure Railway auto-backups

---

## 🆘 SUPPORT

- **Railway Docs:** https://docs.railway.app
- **Vercel Docs:** https://vercel.com/docs
- **Project Issues:** https://github.com/Mohitsagar236/interview-ai/issues

---

**You're all set! 🚀**
