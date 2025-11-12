# 🔧 Koyeb Environment Variables - Copy & Paste Guide

## 📋 Required Environment Variables

Copy these **exactly** into your Koyeb service settings:

### Core Configuration (Required for Connection)
```
CLOUD_MODE=true
ALLOWED_ORIGINS=*
PORT=8000
HOST=0.0.0.0
```

### AI Provider Configuration (Required for AI Features)
```
OPENROUTER_API_KEY=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
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM=openai/gpt-4o-mini
AI_TEMPERATURE=0.1
```

### Transcription Configuration (Required for Speech Recognition)
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

---

## 🚀 Step-by-Step Instructions

### Step 1: Access Koyeb Dashboard
1. Open: https://app.koyeb.com/
2. Log in to your account
3. Find your service (likely named `interview-ai` or `interview-ai-backend`)

### Step 2: Navigate to Environment Variables
1. Click on your service name
2. Click **Settings** in the left sidebar
3. Scroll to **Environment Variables** section

### Step 3: Add Variables (Method 1 - One by One)

Click **Add Variable** for each one:

| Name | Value |
|------|-------|
| `CLOUD_MODE` | `true` |
| `ALLOWED_ORIGINS` | `*` |
| `PORT` | `8000` |
| `HOST` | `0.0.0.0` |
| `OPENROUTER_API_KEY` | `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` |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` |
| `DEFAULT_LLM` | `openai/gpt-4o-mini` |
| `AI_TEMPERATURE` | `0.1` |
| `DEEPGRAM_API_KEY` | `4bfe6cc554cfdef77f2adc9fc7d3ea140f10b24d` |
| `USE_STREAMING_TRANSCRIPTION` | `true` |
| `STREAMING_PROVIDER` | `deepgram` |
| `STREAMING_SAMPLE_RATE` | `16000` |
| `STREAMING_ENCODING` | `linear16` |
| `STREAMING_CHANNELS` | `1` |
| `STREAMING_INTERIM_RESULTS` | `false` |
| `STREAMING_PUNCTUATE` | `true` |
| `STREAMING_SMART_FORMAT` | `true` |
| `STREAMING_LANGUAGE` | `en-US` |
| `STREAMING_MODEL` | `nova-2` |
| `STREAMING_VAD_EVENTS` | `true` |

### Step 4: Add Variables (Method 2 - Bulk Import)

Some Koyeb interfaces support bulk import. If available, use this format:

```env
CLOUD_MODE=true
ALLOWED_ORIGINS=*
PORT=8000
HOST=0.0.0.0
OPENROUTER_API_KEY=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
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM=openai/gpt-4o-mini
AI_TEMPERATURE=0.1
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

### Step 5: Save and Redeploy
1. Click **Save** or **Update**
2. Click **Redeploy** (or Koyeb may auto-redeploy)
3. Wait 2-5 minutes for deployment to complete
4. Check deployment logs for "✅" success messages

### Step 6: Verify Deployment
Monitor the Koyeb logs. You should see:
```
INFO:websockets.server:server listening on 0.0.0.0:8000
INFO:server:Server listening on ws://0.0.0.0:8000 (Cloud Mode: True)
INFO:server:🌐 Running in CLOUD MODE - accepting connections from ['*']
INFO:ai_providers:OpenAI initialized with model: openai/gpt-4o-mini
Instance is healthy. All health checks are passing.
```

---

## 🧪 Test After Deployment

### Test 1: WebSocket Connection
```powershell
node test-cloud-enhanced.js
```
**Expected**: ✅ Connection SUCCESSFUL!

### Test 2: Run Desktop App
```powershell
.\run-cloud.ps1
```
**Expected**: App starts and connects to backend

---

## ⚠️ Critical Variables Explained

### Connection Variables:
- **CLOUD_MODE=true** - Enables cloud mode (accepts external connections)
- **ALLOWED_ORIGINS=*** - Allows connections from any origin (required for desktop app)
- **PORT=8000** - Port number (Koyeb expects 8000)
- **HOST=0.0.0.0** - Listen on all network interfaces

### AI Variables:
- **OPENROUTER_API_KEY** - Your OpenRouter API key (handles AI requests)
- **DEFAULT_LLM** - AI model to use (gpt-4o-mini is fast and cheap)

### Transcription Variables:
- **DEEPGRAM_API_KEY** - For real-time speech-to-text
- **USE_STREAMING_TRANSCRIPTION=true** - Enables streaming transcription

---

## 🔍 Troubleshooting

### Still Getting 403 After Adding Variables?
- Wait 5 minutes for deployment to complete
- Check Koyeb logs for errors
- Verify all variables are saved
- Try manually redeploying again

### Variables Not Saving?
- Make sure you clicked "Save" or "Update"
- Check if there's a character limit (unlikely)
- Try adding them one by one instead of bulk

### Deployment Failing?
- Check Koyeb deployment logs
- Look for Python errors
- Verify Dockerfile is correct (it should be)

### Can't Find Environment Variables Section?
- Try: Service → Settings → Environment
- Or: Service → Settings → Variables
- Or: Service → Configure → Environment Variables

---

## 📞 Quick Reference

**Koyeb Dashboard**: https://app.koyeb.com/
**Your Backend URL**: `wss://interview-ai-breakable-benny.koyeb.app`
**Test Command**: `node test-cloud-enhanced.js`
**Run App**: `.\run-cloud.ps1`

---

## ✅ Checklist

- [ ] Opened Koyeb dashboard
- [ ] Found interview-ai service
- [ ] Navigated to Environment Variables
- [ ] Added CLOUD_MODE=true
- [ ] Added ALLOWED_ORIGINS=*
- [ ] Added PORT=8000
- [ ] Added HOST=0.0.0.0
- [ ] Added OPENROUTER_API_KEY
- [ ] Added OPENAI_BASE_URL
- [ ] Added DEFAULT_LLM
- [ ] Added DEEPGRAM_API_KEY
- [ ] Added USE_STREAMING_TRANSCRIPTION=true
- [ ] Added STREAMING_PROVIDER=deepgram
- [ ] Added remaining streaming config
- [ ] Clicked Save/Update
- [ ] Clicked Redeploy
- [ ] Waited 2-5 minutes
- [ ] Checked deployment logs
- [ ] Ran: `node test-cloud-enhanced.js`
- [ ] Saw: ✅ Connection SUCCESSFUL
- [ ] Ran: `.\run-cloud.ps1`
- [ ] Desktop app connected!

---

**Status**: Ready to configure
**Time Required**: 5-10 minutes
**Difficulty**: Easy (copy & paste)
