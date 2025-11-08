# 🚀 Deploy to Koyeb - Quick Start Guide

## Prerequisites
- GitHub account (your code is already there!)
- Koyeb account (free, no credit card needed)

## Step-by-Step Deployment

### 1️⃣ Sign Up for Koyeb

1. Go to: https://app.koyeb.com/auth/signup
2. Click **"Sign up with GitHub"**
3. Authorize Koyeb to access your repositories
4. Complete the signup (no credit card required!)

### 2️⃣ Create New App

1. Once logged in, click **"Create App"**
2. Choose **"Deploy from GitHub"**
3. Select your repository: `Mohitsagar236/interview-ai`
4. Select branch: `main`

### 3️⃣ Configure Build Settings

**Build Configuration:**
- **Builder:** Docker
- **Dockerfile path:** `Dockerfile` (in root)
- **Build context:** `.` (root directory)

**Instance Type:**
- Select: **"Nano"** (Free tier - 512 MB RAM)

**Port Configuration:**
- **Port:** `8765`
- **Protocol:** HTTP

### 4️⃣ Add Environment Variables

Click **"Environment variables"** and add these:

```
CLOUD_MODE=true
PORT=8765
HOST=0.0.0.0
ALLOWED_ORIGINS=*

# Your API Keys (from .env file)
OPENROUTER_API_KEY=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
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM=openai/gpt-4o-mini
DEEPGRAM_API_KEY=4bfe6cc554cfdef77f2adc9fc7d3ea140f10b24d

# Supabase (for credits sync)
SUPABASE_URL=https://npdysfxewryqcmmztdxl.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM3MzIyNSwiZXhwIjoyMDc3OTQ5MjI1fQ.EH-T6rww0phbKYSYwGVtQG4hgbI-J5NP5F5lSrp3y98
```

### 5️⃣ Select Region

Choose the closest region:
- **was** (Washington, D.C.) - Best for US East
- **fra** (Frankfurt) - Best for Europe
- **sin** (Singapore) - Best for Asia

### 6️⃣ Deploy!

1. Review your configuration
2. Click **"Deploy"** button
3. Wait 3-5 minutes for deployment

### 7️⃣ Get Your Server URL

After deployment completes:
1. Go to your app dashboard
2. Find the URL (something like: `interview-ai-backend-xxxxxx.koyeb.app`)
3. Your WebSocket URL will be: `wss://your-app-name.koyeb.app`

## 🔧 Update Desktop App to Use Cloud Server

After deployment, you need to update your desktop app:

### Edit: `electron/desktop-activation-manager.js`

Find this line (around line 20):
```javascript
this.apiBaseUrl = isProduction ? 'https://interviewai.space' : 'http://localhost:3000';
```

Add a line for the Python server:
```javascript
this.pythonServerUrl = isProduction ? 'wss://YOUR-KOYEB-APP.koyeb.app' : 'ws://localhost:8765';
```

Replace `YOUR-KOYEB-APP` with your actual Koyeb app URL.

Then rebuild and reinstall:
```powershell
npm run build:prod
```

## ✅ Testing

1. Open your desktop app
2. Activate with your code
3. Press `Alt+C` to capture
4. Should connect to cloud server instead of localhost!

## 📊 Monitoring

In Koyeb dashboard you can see:
- Server logs (real-time)
- CPU/RAM usage
- Request count
- Error logs

## 🆘 Troubleshooting

### Build Fails
- Check Dockerfile path is correct
- Verify `requirements-cloud.txt` exists in `python/` folder

### Server Won't Start
- Check logs in Koyeb dashboard
- Verify all environment variables are set
- Make sure PORT=8765 is set

### Desktop App Can't Connect
- Verify you updated the server URL in the code
- Check if server is running in Koyeb dashboard
- Try the health check: `https://your-app.koyeb.app/health`

## 💰 Cost

FREE tier includes:
- 512 MB RAM
- 0.1 vCPU
- 100 GB bandwidth/month
- Always on (no cold starts!)

## 📝 Notes

- First deployment takes 5-10 minutes
- Subsequent deploys (auto from GitHub) take 3-5 minutes
- Server stays running 24/7 on free tier
- You get unlimited deployments

---

**Need help?** Let me know! 🚀
