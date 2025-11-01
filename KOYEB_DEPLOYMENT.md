# 🚀 Koyeb Deployment Checklist

## ✅ Files Ready for Koyeb Deployment

All necessary files have been created:

1. ✅ **Dockerfile** - Builds your Python backend
2. ✅ **.dockerignore** - Optimizes Docker build
3. ✅ **koyeb.yaml** - Koyeb configuration (optional but helpful)
4. ✅ **python/requirements-cloud.txt** - Cloud dependencies
5. ✅ **python/server.py** - Has `/health` endpoint

---

## 📋 Quick Deployment Steps

### **Step 1: Commit & Push (if not done)**
```powershell
git add .
git commit -m "Add Koyeb deployment configuration"
git push origin main
```

### **Step 2: Deploy on Koyeb**

1. **Go to:** https://www.koyeb.com
2. **Sign up** with GitHub
3. **Click:** "Create Service"
4. **Select:** GitHub
5. **Choose:** `Mohitsagar236/interview-ai`

### **Step 3: Configure Service**

**Builder Settings:**
- Builder: **Docker**
- Dockerfile: **Dockerfile**
- Build context: **.** (root)

**Service Settings:**
- Service name: **interview-ai-backend**
- Region: **Washington, D.C. (us-east)** or closest to you
- Instance: **Nano (Free)** ← Select this!

**Port:**
- Port: **8765**
- Protocol: **HTTP**

### **Step 4: Environment Variables**

Click "Add Environment Variable" and add these:

**Required:**
```
CLOUD_MODE = true
PORT = 8765
HOST = 0.0.0.0
ALLOWED_ORIGINS = *
```

**Your API Keys:**
```
OPENAI_API_KEY = sk-proj-YOUR_KEY
DEEPGRAM_API_KEY = YOUR_KEY
DEFAULT_LLM = gpt-4o-mini

# OR use OpenRouter
OPENROUTER_API_KEY = sk-or-v1-YOUR_KEY
OPENAI_BASE_URL = https://openrouter.ai/api/v1
DEFAULT_LLM = openai/gpt-4o-mini

# OR use Groq (FREE)
GROQ_API_KEY = gsk_YOUR_KEY
DEFAULT_LLM = llama-3.1-70b-versatile
```

**Transcription:**
```
USE_STREAMING_TRANSCRIPTION = true
STREAMING_PROVIDER = deepgram
DEEPGRAM_MODEL = nova-2
```

### **Step 5: Deploy!**

1. Click **"Deploy"**
2. Wait 3-5 minutes for build
3. Your backend will be live! 🎉

---

## 🔗 After Deployment

### **Get Your URL:**
Your backend will be at:
```
https://interview-ai-backend-YOUR_APP.koyeb.app
```

### **Test Health:**
Visit in browser:
```
https://your-backend-url.koyeb.app/health
```

### **Update Frontend:**
In your frontend code, change WebSocket URL:
```javascript
// Change this:
const ws = new WebSocket('ws://localhost:8765');

// To this:
const ws = new WebSocket('wss://interview-ai-backend-YOUR_APP.koyeb.app');
```

---

## 🎯 What's Included

Your Koyeb deployment includes:
- ✅ Python 3.11
- ✅ WebSocket support
- ✅ AI providers (OpenAI, Anthropic, Groq)
- ✅ Deepgram transcription
- ✅ OCR capabilities
- ✅ Health check endpoint
- ✅ Auto-deploy on git push
- ✅ HTTPS/WSS encryption

---

## 📊 Free Tier Details

**Koyeb Free Tier:**
- 💰 **Cost:** $0/month
- 💾 **RAM:** 512 MB
- 🌐 **Bandwidth:** 100 GB/month
- 🔄 **Auto-sleep:** Yes (after inactivity)
- ⚡ **Wake time:** ~30 seconds

**Keep it awake (optional):**
Use UptimeRobot to ping every 5 minutes:
https://uptimerobot.com

---

## 🔧 Troubleshooting

### **Build fails:**
- Check Koyeb build logs
- Verify Dockerfile is correct
- Ensure requirements-cloud.txt exists

### **Service won't start:**
- Check service logs
- Verify PORT=8765 is set
- Check all environment variables

### **Can't connect:**
- Use `wss://` not `ws://`
- Check CORS settings
- Verify URL is correct

---

## ✅ Ready to Deploy!

All files are ready. Just:
1. Push to GitHub (if needed)
2. Go to Koyeb.com
3. Follow the steps above
4. Your backend will be live in 5 minutes!

**Need help? Let me know!** 🚀
