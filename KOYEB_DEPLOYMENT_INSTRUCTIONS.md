# 🚀 Deploy Backend to Koyeb - Complete Guide

## ✅ Current Status
- Dockerfile configured: ✅
- Environment variables ready: ✅
- Koyeb config ready: ✅
- Electron app updated: ✅

## 📋 Prerequisites
1. Koyeb account (free tier available)
2. GitHub repository connected to Koyeb
3. API keys ready (OpenRouter, Deepgram)

## 🔧 Deployment Steps

### Option 1: Deploy via Koyeb Dashboard (Recommended)

1. **Login to Koyeb**
   - Go to: https://app.koyeb.com
   - Login with GitHub

2. **Create New Service**
   - Click "Create Service"
   - Select "GitHub" as source
   - Choose repository: `Mohitsagar236/interview-ai`
   - Branch: `main`

3. **Configure Build**
   - Builder: **Docker**
   - Dockerfile path: `Dockerfile`
   - Build context: `.`

4. **Configure Service**
   - Service name: `interview-ai-backend`
   - Instance type: **Nano** (512 MB - Free tier)
   - Regions: Select **was** (Washington D.C.)
   - Port: **8000**
   - Protocol: **HTTP**

5. **Add Environment Variables**
   Click "Advanced" > "Environment variables" and add:
   
   ```
   CLOUD_MODE=true
   PORT=8000
   HOST=0.0.0.0
   ALLOWED_ORIGINS=*
   WS_PING_INTERVAL=30
   WS_PING_TIMEOUT=60
   
   # AI Configuration
   OPENROUTER_API_KEY=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
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   DEFAULT_LLM=openai/gpt-4o-mini
   AI_TEMPERATURE=0.1
   
   # Transcription
   DEEPGRAM_API_KEY=4bfe6cc554cfdef77f2adc9fc7d3ea140f10b24d
   USE_STREAMING_TRANSCRIPTION=true
   STREAMING_PROVIDER=deepgram
   STREAMING_SAMPLE_RATE=16000
   STREAMING_ENCODING=linear16
   STREAMING_CHANNELS=1
   STREAMING_INTERIM_RESULTS=false
   STREAMING_PUNCTUATE=true
   STREAMING_SMART_FORMAT=true
   STREAMING_LANGUAGE=en-US
   STREAMING_MODEL=nova-2
   STREAMING_VAD_EVENTS=true
   
   # Supabase (if using credits sync)
   SUPABASE_URL=https://npdysfxewryqcmmztdxl.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM3MzIyNSwiZXhwIjoyMDc3OTQ5MjI1fQ.EH-T6rww0phbKYSYwGVtQG4hgbI-J5NP5F5lSrp3y98
   ```

6. **Deploy**
   - Click "Deploy"
   - Wait 3-5 minutes for build and deployment

7. **Get Your Backend URL**
   After deployment:
   - Your URL will be: `interview-ai-backend-mohitsagar236.koyeb.app`
   - WebSocket URL: `wss://interview-ai-backend-mohitsagar236.koyeb.app`
   - Health check: `https://interview-ai-backend-mohitsagar236.koyeb.app/health`

### Option 2: Deploy via Koyeb CLI

```powershell
# Install Koyeb CLI
npm install -g @koyeb/cli

# Login
koyeb login

# Create service
koyeb service create interview-ai-backend \
  --docker Dockerfile \
  --ports 8000:http \
  --instance-type nano \
  --env CLOUD_MODE=true \
  --env PORT=8000 \
  --env HOST=0.0.0.0 \
  --env ALLOWED_ORIGINS=* \
  --env OPENROUTER_API_KEY=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 \
  --env DEEPGRAM_API_KEY=4bfe6cc554cfdef77f2adc9fc7d3ea140f10b24d \
  --git-branch main \
  --git https://github.com/Mohitsagar236/interview-ai
```

## 🧪 Test Deployment

### Test Backend Health
```powershell
# Test health endpoint
curl https://interview-ai-backend-mohitsagar236.koyeb.app/health

# Expected response:
# {"status":"healthy","mode":"cloud",...}
```

### Test WebSocket Connection
```powershell
# Run test script
node test-cloud-ws.js
```

Or manually test in browser console:
```javascript
const ws = new WebSocket('wss://interview-ai-backend-mohitsagar236.koyeb.app/ui');
ws.onopen = () => console.log('✅ Connected!');
ws.onerror = (e) => console.error('❌ Error:', e);
ws.onmessage = (e) => console.log('📨 Message:', e.data);
```

## 🖥️ Update Desktop App

The Electron app has been updated to use the Koyeb backend:
- Development: Uses local server by default (set `USE_LOCAL_SERVER=false` to test cloud)
- Production: Always uses cloud backend

### Test with Development Mode
```powershell
# Test cloud backend in development
$env:USE_LOCAL_SERVER="false"
npm run dev
```

### Build Production App
```powershell
# Build with cloud backend
npm run build:prod
```

## 🔍 Troubleshooting

### Issue: "Connection Failed"
**Solution:**
1. Check backend is running: Visit health endpoint
2. Verify environment variables are set in Koyeb dashboard
3. Check logs in Koyeb dashboard
4. Ensure WebSocket protocol is `wss://` not `ws://`

### Issue: "401 Unauthorized"
**Solution:**
1. Verify API keys are correct in Koyeb environment variables
2. Check ALLOWED_ORIGINS includes `*` or your domain

### Issue: "Build Failed"
**Solution:**
1. Check Dockerfile syntax
2. Verify `requirements-cloud.txt` exists
3. Check build logs in Koyeb dashboard

### Issue: "Service Crash Loop"
**Solution:**
1. Check application logs in Koyeb
2. Verify all required environment variables are set
3. Test locally with Docker:
   ```powershell
   docker build -t interview-ai-backend .
   docker run -p 8000:8000 --env-file .env interview-ai-backend
   ```

## 📊 Monitor Deployment

### Koyeb Dashboard
- Logs: Real-time application logs
- Metrics: CPU, Memory, Network usage
- Health: Service health status

### Health Check Endpoint
```
https://interview-ai-backend-mohitsagar236.koyeb.app/health
```

Returns:
```json
{
  "status": "healthy",
  "mode": "cloud",
  "ai_providers": {...},
  "timestamp": 1234567890.123
}
```

## 🎯 Next Steps

1. ✅ Deploy backend to Koyeb
2. ✅ Test WebSocket connection
3. ✅ Test desktop app with cloud backend
4. 📦 Build and distribute desktop app
5. 🌐 (Optional) Deploy web frontend to Vercel

## 📝 Notes

- Free tier includes: 512 MB RAM, 2 GB disk, 100 GB bandwidth/month
- Auto-deploys on git push to main branch
- SSL/TLS termination handled by Koyeb automatically
- WebSocket connections supported natively
- Health checks run every 30 seconds
