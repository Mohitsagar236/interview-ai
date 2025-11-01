# 🚀 Deploy Backend on Render (100% FREE)

## Why Render?
- ✅ **Completely FREE** (no credit card required)
- ✅ **750 hours/month** of runtime (enough for development/small projects)
- ✅ Auto-sleep after 15 min inactivity (wakes up automatically on request)
- ✅ Automatic HTTPS SSL certificates
- ✅ Easy GitHub integration

---

## 📋 Step-by-Step Deployment Guide

### **Step 1: Sign Up on Render**
1. Go to **https://render.com**
2. Click **"Get Started"** or **"Sign Up"**
3. Sign up with your **GitHub account** (recommended)

---

### **Step 2: Create New Web Service**
1. Once logged in, click **"New +"** button (top right)
2. Select **"Web Service"**
3. Click **"Connect a repository"**
4. If prompted, authorize Render to access your GitHub repos
5. Find and select: **`Mohitsagar236/interview-ai`**
6. Click **"Connect"**

---

### **Step 3: Configure Your Service**

Render will show you a configuration page. Fill in these details:

#### **Basic Settings:**
- **Name:** `interview-ai-backend` (or any name you prefer)
- **Region:** `Oregon (US West)` (or closest to you)
- **Branch:** `main`
- **Runtime:** `Python 3`

#### **Build & Start Commands:**
- **Build Command:**
  ```bash
  pip install -r python/requirements-cloud.txt
  ```

- **Start Command:**
  ```bash
  python python/server.py
  ```

#### **Plan:**
- Select **"Free"** plan 🆓

---

### **Step 4: Add Environment Variables** ⚙️

Scroll down to **"Environment Variables"** section and click **"Add Environment Variable"**.

Add these one by one:

#### **Required Variables:**
```bash
CLOUD_MODE = true
PORT = 8765
HOST = 0.0.0.0
ALLOWED_ORIGINS = *
```

#### **AI Provider Keys** (Add the ones you have):

**Option 1: Using OpenRouter (Recommended - gives access to multiple models)**
```bash
OPENROUTER_API_KEY = sk-or-v1-YOUR_KEY_HERE
OPENAI_BASE_URL = https://openrouter.ai/api/v1
DEFAULT_LLM = openai/gpt-4o-mini
```

**Option 2: Using Direct OpenAI**
```bash
OPENAI_API_KEY = sk-proj-YOUR_KEY_HERE
DEFAULT_LLM = gpt-4o-mini
```

**Option 3: Using Groq (FREE & Fast)**
```bash
GROQ_API_KEY = gsk_YOUR_KEY_HERE
DEFAULT_LLM = llama-3.1-70b-versatile
```

#### **Transcription (Deepgram - for voice input):**
```bash
DEEPGRAM_API_KEY = YOUR_DEEPGRAM_KEY_HERE
USE_STREAMING_TRANSCRIPTION = true
STREAMING_PROVIDER = deepgram
DEEPGRAM_MODEL = nova-2
```

#### **Optional Settings:**
```bash
AI_TEMPERATURE = 0.7
AI_MAX_TOKENS = 500
ENABLE_STREAMING_RESPONSE = true
```

---

### **Step 5: Deploy!** 🚀

1. Click **"Create Web Service"** at the bottom
2. Render will start building your app (takes 2-5 minutes)
3. Watch the logs in the dashboard
4. Once you see **"Your service is live 🎉"**, it's ready!

---

### **Step 6: Get Your Backend URL** 🔗

1. On the service dashboard, you'll see a URL like:
   ```
   https://interview-ai-backend.onrender.com
   ```

2. **IMPORTANT:** Copy this URL - you'll need it for your frontend!

3. Test your backend by visiting:
   ```
   https://interview-ai-backend.onrender.com/health
   ```
   (You should see a health check response)

---

### **Step 7: Update Your Frontend**

Now update your frontend (deployed on Vercel/Netlify) to use the Render backend URL:

In your frontend code, change the WebSocket connection from:
```javascript
// OLD
const ws = new WebSocket('ws://localhost:8765');

// NEW
const ws = new WebSocket('wss://interview-ai-backend.onrender.com');
```

---

## 🎯 Important Notes

### **Auto-Sleep on Free Plan:**
- Your backend will **sleep after 15 minutes** of inactivity
- First request after sleep takes **30-60 seconds** to wake up
- Subsequent requests are instant

### **Keep it Awake (Optional):**
If you want to prevent sleep, use a free service like **UptimeRobot**:
1. Go to https://uptimerobot.com
2. Create a free account
3. Add your Render URL to monitor
4. It will ping every 5 minutes, keeping your backend awake

### **Upgrade Later (Optional):**
- If you need 24/7 uptime without sleep, upgrade to **Starter plan ($7/month)**
- You can always upgrade later when needed

---

## 🔧 Troubleshooting

### **Build Fails:**
- Check the build logs in Render dashboard
- Make sure `python/requirements-cloud.txt` exists
- Verify all Python dependencies are listed

### **Service Won't Start:**
- Check the service logs
- Verify environment variables are set correctly
- Make sure PORT is set to 8765

### **WebSocket Connection Fails:**
- Use `wss://` (not `ws://`) for secure connections
- Check CORS settings in backend
- Verify ALLOWED_ORIGINS is set to `*` or your frontend URL

---

## 📊 Monitor Your Service

1. Go to your Render dashboard
2. Click on your service
3. Check:
   - **Logs:** Real-time application logs
   - **Metrics:** CPU, Memory usage
   - **Events:** Deployment history

---

## 🎉 You're Done!

Your backend is now deployed on Render for **FREE**!

**Your Setup:**
- ✅ Frontend: Vercel/Netlify (Free)
- ✅ Backend: Render (Free)
- ✅ Total Cost: $0/month 🎊

---

## 🆘 Need Help?

If you face any issues:
1. Check Render logs in the dashboard
2. Verify all environment variables are set
3. Make sure your GitHub repo is up to date
4. Check the troubleshooting section above

---

## 🔄 Auto-Deploy Updates

Once connected to GitHub:
1. Make changes to your code
2. Commit and push to GitHub
3. Render automatically rebuilds and deploys! 🚀

```bash
git add .
git commit -m "Update backend"
git push origin main
```

Render will detect the push and deploy automatically!
