# Cloud Deployment Guide

This comprehensive guide covers deploying the Interview AI backend to various cloud platforms.

## Architecture Overview

### Local-Only Architecture (Development)
```
User's Computer:
├── Electron App (Frontend)
└── Python Server (localhost:8765)
```

### Cloud-Based Architecture (Production)
```
User's Computer:
└── Electron App (Frontend)
        ↓ WebSocket (wss://)
Cloud Server:
└── Python Backend (wss://your-domain.com)
```

---

## Deployment Options

| Platform | Free Tier | WebSocket Support | Cold Starts | Recommended For |
|----------|-----------|-------------------|-------------|-----------------|
| **Koyeb** | ✅ 512MB RAM | ✅ Native | ❌ Always on | Production |
| **Render** | ✅ Limited | ✅ Native | ⚠️ Yes | Development |
| **Railway** | ⚠️ $5 credit | ✅ Native | ❌ Always on | Production |
| **Fly.io** | ✅ 3 VMs | ✅ Native | ⚠️ Configurable | Advanced |

---

## Option 1: Deploy to Koyeb (Recommended)

### Prerequisites
- GitHub account
- Koyeb account (free, no credit card needed)

### Step-by-Step Deployment

#### 1. Sign Up for Koyeb
1. Go to: https://app.koyeb.com/auth/signup
2. Click **"Sign up with GitHub"**
3. Authorize Koyeb to access your repositories

#### 2. Create New App
1. Click **"Create App"**
2. Choose **"Deploy from GitHub"**
3. Select your repository: `Mohitsagar236/interview-ai`
4. Select branch: `main`

#### 3. Configure Build Settings
- **Builder:** Docker
- **Dockerfile path:** `Dockerfile`
- **Build context:** `.`
- **Instance Type:** Nano (Free tier - 512 MB RAM)
- **Port:** `8765`
- **Protocol:** HTTP

#### 4. Add Environment Variables
```bash
CLOUD_MODE=true
PORT=8765
HOST=0.0.0.0
ALLOWED_ORIGINS=*

# API Keys
OPENROUTER_API_KEY=your_key_here
DEEPGRAM_API_KEY=your_key_here

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```

#### 5. Deploy
- Review configuration
- Click **"Deploy"**
- Wait 3-5 minutes

#### 6. Get Your Server URL
Your WebSocket URL: `wss://your-app-name.koyeb.app`

---

## Option 2: Deploy to Render

### Step-by-Step

1. **Sign up for Render.com** (https://render.com)
2. **Create a new Web Service**
   - Click "New +" → "Web Service"
   - Connect your repository
   - Render auto-detects `render.yaml`

3. **Configure Environment Variables** in Render Dashboard:
   ```
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...
   GROQ_API_KEY=gsk_...
   DEEPGRAM_API_KEY=...
   OPENROUTER_API_KEY=sk-or-...
   ```

4. **Wait for Deployment** (~5 minutes)

5. **Your Service URL**: `wss://interview-ai-backend-xxxx.onrender.com`

---

## Option 3: Deploy to Railway

### Configuration

Create `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "python python/server.py",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## Option 4: Deploy to Fly.io

### Configuration

Create `fly.toml`:
```toml
app = "interview-ai-backend"

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  PORT = "8765"

[[services]]
  internal_port = 8765
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

---

## Post-Deployment: Update Desktop App

After deploying your backend, update the desktop app configuration:

### Edit `electron/config.js`:
```javascript
module.exports = {
  production: {
    serverUrl: 'wss://your-backend-url.koyeb.app',
    useLocalServer: false
  },
  development: {
    serverUrl: 'ws://localhost:8765',
    useLocalServer: true
  }
};
```

### Rebuild the App:
```powershell
npm run build:prod
```

---

## Testing Cloud Connection

```powershell
# Test WebSocket connection
node test-cloud-ws.js

# Test health endpoint
curl https://your-app.koyeb.app/health
```

---

## Monitoring

### Koyeb Dashboard
- Real-time logs
- CPU/RAM usage
- Request count
- Error logs

### Health Check Endpoint
All deployments expose `/health` for monitoring.

---

## Troubleshooting

### Build Fails
- Check Dockerfile path is correct
- Verify `requirements.txt` or `requirements-cloud.txt` exists

### Server Won't Start
- Check logs in platform dashboard
- Verify all environment variables are set
- Ensure PORT is correctly configured

### Desktop App Can't Connect
- Verify server URL is updated in `electron/config.js`
- Check if server is running (check platform dashboard)
- Test health endpoint: `https://your-app.koyeb.app/health`
- Ensure using `wss://` (not `ws://`) for production

---

## Cost Summary

| Platform | Free Tier Limits |
|----------|-----------------|
| Koyeb | 512 MB RAM, 0.1 vCPU, 100 GB bandwidth/month |
| Render | 750 hours/month, spins down after 15 min inactivity |
| Railway | $5 free credit, then pay-as-you-go |
| Fly.io | 3 shared VMs, 160 GB bandwidth |
