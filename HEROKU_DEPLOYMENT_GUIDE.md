# 🚀 HEROKU + VERCEL DEPLOYMENT GUIDE

**Backend:** Heroku  
**Website:** Vercel  
**Time Required:** 30-40 minutes

---

## 📋 PREREQUISITES

### 1. Create Accounts (Free)
- [ ] **Heroku Account:** https://signup.heroku.com
- [ ] **Vercel Account:** https://vercel.com/signup
- [ ] **GitHub Account:** https://github.com/join (you already have this)

### 2. Install Heroku CLI
```powershell
# Download and install from:
# https://devcenter.heroku.com/articles/heroku-cli

# Verify installation
heroku --version
```

### 3. Prepare API Keys
You'll need these environment variables:
- `OPENAI_API_KEY` or `OPENROUTER_API_KEY`
- `DEEPGRAM_API_KEY`
- `ANTHROPIC_API_KEY` (optional)
- `GROQ_API_KEY` (optional)

---

## 🔴 PART 1: DEPLOY BACKEND TO HEROKU (20 min)

### Step 1: Commit Your Code
```powershell
cd C:\Users\cp813\Desktop\interview-ai

# Commit all cloud deployment changes
git add .
git commit -m "Configure for Heroku backend and Vercel frontend"
git push origin main
```

### Step 2: Login to Heroku CLI
```powershell
heroku login
# Press any key to open browser and login
```

### Step 3: Create Heroku App
```powershell
# Create app (replace 'interview-ai-backend' with your preferred name)
heroku create interview-ai-backend

# This creates:
# https://interview-ai-backend.herokuapp.com (HTTP)
# wss://interview-ai-backend.herokuapp.com (WebSocket)
```

### Step 4: Set Environment Variables
```powershell
# Required settings
heroku config:set CLOUD_MODE=true --app interview-ai-backend
heroku config:set PORT=8765 --app interview-ai-backend
heroku config:set HOST=0.0.0.0 --app interview-ai-backend
heroku config:set ALLOWED_ORIGINS=* --app interview-ai-backend

# AI API Keys
heroku config:set OPENAI_API_KEY=sk-your-key-here --app interview-ai-backend
heroku config:set DEEPGRAM_API_KEY=your-key-here --app interview-ai-backend

# Optional: Other LLM providers
heroku config:set ANTHROPIC_API_KEY=sk-ant-your-key --app interview-ai-backend
heroku config:set GROQ_API_KEY=gsk_your-key --app interview-ai-backend
heroku config:set OPENROUTER_API_KEY=sk-or-your-key --app interview-ai-backend

# Optional: Configuration
heroku config:set DEFAULT_LLM=gpt-4o-mini --app interview-ai-backend
heroku config:set AI_TEMPERATURE=0.7 --app interview-ai-backend
heroku config:set USE_STREAMING_TRANSCRIPTION=true --app interview-ai-backend
```

### Step 5: Deploy to Heroku
```powershell
# Deploy from main branch
git push heroku main

# Or if you're on a different branch:
git push heroku your-branch:main
```

### Step 6: Scale the Dyno
```powershell
# Start the web dyno
heroku ps:scale web=1 --app interview-ai-backend
```

### Step 7: Check Deployment
```powershell
# View logs
heroku logs --tail --app interview-ai-backend

# Open app in browser
heroku open --app interview-ai-backend

# Test health endpoint
# Visit: https://interview-ai-backend.herokuapp.com/health
```

### Step 8: Copy Your WebSocket URL
Your backend is now at:
```
wss://interview-ai-backend.herokuapp.com
```
**⚠️ SAVE THIS URL - you'll need it for Step 10!**

---

## 🌐 PART 2: DEPLOY WEBSITE TO VERCEL (10 min)

### Method A: Deploy via CLI (Recommended)
```powershell
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
npm run vercel:deploy

# Follow the prompts:
# ? Set up and deploy "interview-ai"? [Y/n] Y
# ? Which scope? Your account
# ? Link to existing project? [y/N] N
# ? What's your project's name? interview-ai
# ? In which directory is your code located? ./public
# ? Production? [Y/n] Y
```

### Method B: Deploy via Vercel Dashboard
1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your GitHub repo: `Mohitsagar236/interview-ai`
4. Configure:
   - **Framework Preset:** Other
   - **Root Directory:** `public`
   - **Build Command:** (leave empty)
   - **Output Directory:** (leave empty)
5. Click "Deploy"
6. Wait 1-2 minutes
7. Your site: `https://interview-ai.vercel.app`

### Add Custom Domain (Optional)
```powershell
# If you have a domain like interviewai.com
vercel domains add interviewai.com

# Follow the DNS instructions to point your domain to Vercel
```

---

## ⚙️ PART 3: UPDATE ELECTRON APP CONFIG (5 min)

### Step 9: Update electron/config.js
Open `electron/config.js` and update line 18 with your Heroku URL:

```javascript
production: {
  // Replace with YOUR Heroku app URL
  serverUrl: process.env.SERVER_URL || 'wss://interview-ai-backend.herokuapp.com',
  useLocalServer: false,
  cloudMode: true,
  enableDevTools: false,
  logLevel: 'info',
  
  apiKey: process.env.API_KEY || null
},
```

**Replace `interview-ai-backend` with YOUR actual Heroku app name!**

### Step 10: Rebuild Production App
```powershell
# Build production installer with cloud mode
npm run build:prod

# Installer will be in dist/ folder
# dist/Interview AI Assistant Setup 0.1.0.exe
```

---

## 📦 PART 4: UPLOAD INSTALLER TO WEBSITE (5 min)

### Option A: Manual Upload
1. Copy installer to public folder:
```powershell
# Create downloads folder
New-Item -ItemType Directory -Path "public\downloads" -Force

# Copy installer
Copy-Item "dist\Interview AI Assistant Setup 0.1.0.exe" "public\downloads\"

# Commit and redeploy
git add public/downloads/
git commit -m "Add production installer"
git push

# Redeploy to Vercel
vercel --prod
```

2. Update download link in `public/index.html`:
```html
<a href="/downloads/Interview AI Assistant Setup 0.1.0.exe" 
   class="cta-button" download>
  Download for Windows
</a>
```

### Option B: Use CDN
Upload to a file hosting service:
- **AWS S3**
- **Google Cloud Storage**
- **Cloudflare R2**
- **GitHub Releases**

---

## ✅ TESTING YOUR DEPLOYMENT

### Test 1: Backend Health Check
```powershell
# Visit in browser or use curl
curl https://interview-ai-backend.herokuapp.com/health

# Expected response:
# {"status":"healthy","mode":"cloud","ai_providers":["openai","deepgram"]}
```

### Test 2: WebSocket Connection
```powershell
# Use online WebSocket tester:
# https://www.piesocket.com/websocket-tester

# Connect to: wss://interview-ai-backend.herokuapp.com/ui
# Send: {"type":"ping"}
# Expect: {"type":"pong"}
```

### Test 3: Website
1. Visit: https://interview-ai.vercel.app
2. Check download button works
3. Verify documentation loads

### Test 4: Electron App
1. Install production build from `dist/`
2. Open app
3. Check console (Ctrl+Shift+I in dev tools):
   - Should see: `[Cloud Mode] Connecting to cloud server`
   - Should see: `[Cloud] ✅ Connected`
4. Test features:
   - Audio transcription
   - OCR screen capture
   - AI responses

---

## 🐛 TROUBLESHOOTING

### Backend Issues

#### Error: "Application Error"
```powershell
# Check logs
heroku logs --tail --app interview-ai-backend

# Common fixes:
# 1. Missing Procfile
heroku config:get WEB_CONCURRENCY --app interview-ai-backend

# 2. Port binding
heroku config:set PORT=8765 --app interview-ai-backend

# 3. Python version
# Check runtime.txt has: python-3.11.9
```

#### Error: "Crashed dyno"
```powershell
# Restart dyno
heroku restart --app interview-ai-backend

# Check dyno status
heroku ps --app interview-ai-backend

# Scale up if needed
heroku ps:scale web=1 --app interview-ai-backend
```

#### Error: "Module not found"
```powershell
# Check requirements.txt
cat python/requirements-cloud.txt

# Redeploy
git push heroku main
```

### Frontend Issues

#### Error: "404 Not Found"
- Make sure Root Directory is set to `public` in Vercel settings
- Redeploy: `vercel --prod`

#### Error: "Download not working"
- Check file path in HTML
- Ensure file is in `public/downloads/`
- Check file size limit (Vercel max: 100MB per file)

### App Connection Issues

#### App says "Connecting..." forever
1. **Check URL in config.js:**
   ```javascript
   serverUrl: 'wss://interview-ai-backend.herokuapp.com'
   ```
2. **Rebuild app:**
   ```powershell
   npm run build:prod
   ```
3. **Test WebSocket manually:**
   ```powershell
   # Use online tester: https://www.piesocket.com/websocket-tester
   ```

#### App connects but no transcription
1. **Check Deepgram API key:**
   ```powershell
   heroku config:get DEEPGRAM_API_KEY --app interview-ai-backend
   ```
2. **Check logs:**
   ```powershell
   heroku logs --tail --app interview-ai-backend
   ```

#### App connects but no AI responses
1. **Check OpenAI API key:**
   ```powershell
   heroku config:get OPENAI_API_KEY --app interview-ai-backend
   ```
2. **Test manually:**
   - Open app
   - Press Ctrl+Shift+I for DevTools
   - Check Console for errors

---

## 💰 HEROKU PRICING

### Free Tier (Hobby)
- **Cost:** $0/month
- **Limitations:**
  - Sleeps after 30 minutes of inactivity
  - Takes ~30 seconds to wake up
  - 550 dyno hours/month (not enough for 24/7)
- **Good for:** Testing

### Eco Dyno
- **Cost:** $5/month
- **Limitations:**
  - Sleeps after 30 minutes of inactivity
  - 1000 dyno hours/month
- **Good for:** Light usage

### Basic Dyno
- **Cost:** $7/month
- **Features:**
  - Never sleeps (24/7 uptime)
  - Better performance
- **Good for:** Production

### Standard Dyno
- **Cost:** $25-50/month
- **Features:**
  - Autoscaling
  - Better performance
  - Metrics
- **Good for:** High traffic

### Upgrade Command:
```powershell
# Upgrade to Basic ($7/mo - recommended)
heroku ps:type web=basic --app interview-ai-backend

# Upgrade to Standard 1X ($25/mo)
heroku ps:type web=standard-1x --app interview-ai-backend
```

---

## 🔒 SECURITY BEST PRACTICES

### 1. Restrict CORS
Update Heroku config:
```powershell
# Replace * with your Vercel domain
heroku config:set ALLOWED_ORIGINS=https://interview-ai.vercel.app --app interview-ai-backend
```

Update `python/server.py`:
```python
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', 'https://interview-ai.vercel.app').split(',')
```

### 2. Use Environment Variables
Never commit API keys to git:
```powershell
# Check .gitignore includes .env
cat .gitignore | findstr .env
```

### 3. Monitor Logs
```powershell
# Enable log drains (optional)
heroku drains:add https://your-logging-service.com --app interview-ai-backend
```

### 4. Enable HTTPS Only
Heroku provides free SSL - just use `wss://` URLs (not `ws://`)

---

## 📊 MONITORING

### Heroku Metrics
```powershell
# View app metrics
heroku logs --tail --app interview-ai-backend

# View dyno metrics (requires paid plan)
heroku addons:create heroku-metrics:standard --app interview-ai-backend
```

### Vercel Analytics
1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Analytics" tab
4. View traffic, performance, and errors

---

## 🎯 FINAL CHECKLIST

- [ ] Backend deployed to Heroku
- [ ] Heroku app responding at `/health`
- [ ] Environment variables set on Heroku
- [ ] Website deployed to Vercel
- [ ] Website accessible at vercel.app URL
- [ ] `electron/config.js` updated with Heroku URL
- [ ] Production app built with `npm run build:prod`
- [ ] Installer uploaded to website or CDN
- [ ] Download link working on website
- [ ] Tested full workflow: Download → Install → Connect → Use
- [ ] CORS configured (optional but recommended)
- [ ] Dyno scaled to at least Basic tier for 24/7 uptime

---

## 🚀 YOU'RE LIVE!

Your deployment architecture:

```
Users visit Website (Vercel)
        ↓
Download Installer
        ↓
Run Electron App
        ↓
Connects to Backend (Heroku)
        ↓
Backend calls AI APIs
        ↓
Users get AI-powered interviews!
```

**Backend:** https://interview-ai-backend.herokuapp.com  
**Website:** https://interview-ai.vercel.app  
**Desktop App:** Cloud-connected ✅

---

## 📚 USEFUL COMMANDS

```powershell
# Backend (Heroku)
heroku logs --tail --app interview-ai-backend          # View logs
heroku restart --app interview-ai-backend              # Restart app
heroku ps --app interview-ai-backend                   # Check status
heroku config --app interview-ai-backend               # View env vars
heroku releases --app interview-ai-backend             # View releases
heroku rollback --app interview-ai-backend             # Rollback

# Frontend (Vercel)
vercel --prod                                          # Deploy to production
vercel logs                                            # View logs
vercel domains                                         # Manage domains
vercel env pull                                        # Pull env vars

# Local Development
npm run dev                                            # Run locally
npm run build:prod                                     # Build for production
```

---

**Need help?**
- Heroku Docs: https://devcenter.heroku.com
- Vercel Docs: https://vercel.com/docs
- Your logs: `heroku logs --tail`

