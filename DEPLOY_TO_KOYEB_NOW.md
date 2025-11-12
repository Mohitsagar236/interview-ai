# 🚀 KOYEB DEPLOYMENT - QUICK START

## ✅ Changes Pushed to GitHub
Your code has been pushed to GitHub and is ready for Koyeb deployment!

## 🎯 What Was Updated

1. **Dockerfile** - Configured for Koyeb with proper port (8000) and environment
2. **electron/config.js** - Updated to use new Koyeb URL: `interview-ai-backend-mohitsagar236.koyeb.app`
3. **Deployment scripts** - Created automated deployment helpers
4. **Test scripts** - Updated to test new backend URL

## 📋 Deploy to Koyeb (Step-by-Step)

### Step 1: Login to Koyeb
1. Go to: https://app.koyeb.com
2. Login with your GitHub account

### Step 2: Create New Service
1. Click **"Create Service"**
2. Select **"GitHub"** as the source
3. Choose repository: **`Mohitsagar236/interview-ai`**
4. Select branch: **`main`**

### Step 3: Configure Build
In the "Builder" section:
- **Builder**: Select **Docker**
- **Dockerfile path**: `Dockerfile`
- **Build context**: `.` (root directory)

### Step 4: Configure Service
In the "Service" section:
- **Service name**: `interview-ai-backend`
- **Instance type**: **Nano** (Free - 512 MB RAM)
- **Regions**: Select **was** (Washington D.C.)

### Step 5: Configure Ports
In the "Ports" section:
- **Port**: `8000`
- **Protocol**: **HTTP**

### Step 6: Add Environment Variables
Click **"Advanced"** then **"Environment variables"** and add these **exact** variables:

#### Core Configuration (Required)
```
CLOUD_MODE=true
PORT=8000
HOST=0.0.0.0
ALLOWED_ORIGINS=*
WS_PING_INTERVAL=30
WS_PING_TIMEOUT=60
```

#### AI Configuration (Required)
```
OPENROUTER_API_KEY=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
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM=openai/gpt-4o-mini
AI_TEMPERATURE=0.1
```

#### Transcription Configuration (Required)
```
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
```

#### Supabase Configuration (Optional - for credits sync)
```
SUPABASE_URL=https://npdysfxewryqcmmztdxl.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzMyMjUsImV4cCI6MjA3Nzk0OTIyNX0.WsEnKex2VNpY-uKB5oVjK9iEK7Ce1o1dfRWLE5z2nIc
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHlzZnhld3J5cWNtbXp0ZHhsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM3MzIyNSwiZXhwIjoyMDc3OTQ5MjI1fQ.EH-T6rww0phbKYSYwGVtQG4hgbI-J5NP5F5lSrp3y98
```

### Step 7: Deploy!
1. Review all settings
2. Click **"Deploy"** button
3. Wait 3-5 minutes for build and deployment

## 🧪 Test Your Deployment

### Test 1: Health Check
Open in browser:
```
https://interview-ai-backend-mohitsagar236.koyeb.app/health
```

Expected response:
```json
{"status":"healthy","mode":"cloud",...}
```

### Test 2: WebSocket Connection
Run the test script:
```powershell
node test-cloud-ws.js
```

Expected output:
```
✅ Health check response: {"status":"healthy",...}
✅ WebSocket connected!
📨 Received: pong
   Latency: XXms
✅ All tests passed!
```

## 🖥️ Run Your Desktop App

### Development Mode (with Cloud Backend)
```powershell
# Test with cloud backend
$env:USE_LOCAL_SERVER="false"
npm run dev
```

### Production Build
```powershell
# Build app with cloud backend
npm run build:prod
```

The built app will be in `dist/` folder.

## 🎯 Your Backend URLs

Once deployed, your backend will be available at:

- **WebSocket**: `wss://interview-ai-backend-mohitsagar236.koyeb.app`
- **Health Check**: `https://interview-ai-backend-mohitsagar236.koyeb.app/health`
- **UI WebSocket**: `wss://interview-ai-backend-mohitsagar236.koyeb.app/ui`
- **Audio WebSocket**: `wss://interview-ai-backend-mohitsagar236.koyeb.app/audio`

## 🔍 Monitor Your Deployment

### Koyeb Dashboard
- **Logs**: View real-time application logs
- **Metrics**: Monitor CPU, memory, network usage
- **Status**: Check service health and uptime

### Common Issues and Solutions

#### ❌ Build Failed
- Check Koyeb logs for error details
- Verify Dockerfile syntax
- Ensure `python/requirements-cloud.txt` exists

#### ❌ Service Crash Loop
- Check all environment variables are set correctly
- Verify API keys are valid
- Review application logs in Koyeb

#### ❌ Connection Refused
- Ensure PORT=8000 in environment variables
- Check ALLOWED_ORIGINS=* is set
- Verify service is running (check status in Koyeb)

#### ❌ Desktop App Can't Connect
- Verify backend URL in `electron/config.js`
- Test health endpoint in browser
- Run `node test-cloud-ws.js` to diagnose

## 📊 What Happens After Deployment

1. **Auto-Deploy**: Every push to `main` branch auto-deploys
2. **Health Checks**: Koyeb checks `/health` endpoint every 30s
3. **SSL/TLS**: Automatic HTTPS/WSS with valid certificates
4. **Scaling**: Auto-scales based on traffic (within free tier limits)

## 💡 Tips

- **Free Tier Limits**: 512 MB RAM, 2 GB disk, 100 GB bandwidth/month
- **Logs**: Check logs in Koyeb dashboard if something fails
- **Auto-Deploy**: Disable in Koyeb settings if you want manual deploys
- **Multiple Environments**: Create separate services for staging/production

## 🎉 Success!

Once deployed:
1. Your backend runs 24/7 on Koyeb's infrastructure
2. Desktop app connects automatically in production mode
3. No server management needed - Koyeb handles it all!

## 📚 Additional Resources

- **Full Guide**: See `KOYEB_DEPLOYMENT_INSTRUCTIONS.md`
- **Environment Variables**: See `KOYEB_ENV_VARS.md`
- **Troubleshooting**: See `KOYEB_DEPLOYMENT_GUIDE.md`
- **Koyeb Docs**: https://www.koyeb.com/docs

---

Need help? Check the detailed guides in the repository or Koyeb's documentation.
