# Troubleshooting Guide

Solutions to common issues with Interview AI.

## Connection Issues

### Desktop App Can't Connect to Server

**Symptoms:**
- "Connection failed" message
- Toolbar shows disconnected status
- No responses from AI

**Solutions:**

1. **Check server is running**
   ```powershell
   # For local server
   Get-Process python | Where-Object { $_.CommandLine -like "*server.py*" }
   ```

2. **Check server URL in config**
   ```javascript
   // electron/config.js
   serverUrl: 'ws://localhost:8765'  // Local
   serverUrl: 'wss://your-app.koyeb.app'  // Cloud
   ```

3. **Test WebSocket connection**
   ```powershell
   node test-cloud-ws.js
   ```

4. **Check firewall settings**
   - Allow Node.js and Python through Windows Firewall

---

### Cloud Server Not Responding

**Solutions:**

1. **Check server status**
   - Koyeb: Dashboard → Your Service → Logs
   - Render: Dashboard → Logs
   
2. **Test health endpoint**
   ```bash
   curl https://your-app.koyeb.app/health
   ```

3. **Check environment variables** are set in cloud platform

4. **Check for cold starts** (Render free tier sleeps after 15 min)

---

## Activation Issues

### Invalid Activation Code

**Solutions:**

1. **Verify code format**: `XXXX-XXXX-XXXX-XXXX`
2. **Check for extra spaces** when copying
3. **Regenerate code** from profile page
4. **Check code hasn't expired**

### Code Generated But No Credits

**Solutions:**

1. **Verify payment completed** in Razorpay dashboard
2. **Check subscription exists** in Supabase
3. **Sync credits manually** in profile page

---

## AI Response Issues

### No Response / Slow Response

**Solutions:**

1. **Check API key is valid**
   ```powershell
   # Test OpenRouter
   curl -H "Authorization: Bearer $env:OPENROUTER_API_KEY" \
        https://openrouter.ai/api/v1/models
   ```

2. **Check model availability** on OpenRouter status page

3. **Try different model**
   ```bash
   DEFAULT_LLM=anthropic/claude-3-haiku
   ```

### Poor Quality Responses

**Solutions:**

1. **Update resume** for better context
2. **Be specific** in questions
3. **Check prompt templates** in `config/prompts.yaml`

---

## OCR Issues

### Screenshot Not Capturing

**Solutions:**

1. **Check hotkey** is correctly configured (default: Alt+C)
2. **Run as administrator** if permission issues
3. **Check PaddleOCR** is installed:
   ```powershell
   pip show paddleocr
   ```

### Poor OCR Quality

**Solutions:**

1. **Increase screenshot resolution**
2. **Use dark/light mode** with high contrast
3. **Avoid complex backgrounds**

---

## Transcription Issues

### Microphone Not Working

**Solutions:**

1. **Grant microphone permission** in OS settings
2. **Check Deepgram API key** is valid
3. **Test microphone** in other apps first

### Poor Transcription Quality

**Solutions:**

1. **Reduce background noise**
2. **Speak clearly and at moderate pace**
3. **Check microphone quality**

---

## Payment Issues

### Payment Failed

**Solutions:**

1. **Check Razorpay key** is correct (test vs live)
2. **Verify account is activated** in Razorpay
3. **Check browser console** for errors

### Payment Success But No Credits

**Solutions:**

1. **Check webhook received** in Razorpay dashboard
2. **Verify webhook URL** is correct
3. **Check API logs** for errors

---

## Build Issues

### Electron Build Fails

**Solutions:**

1. **Clear node_modules**
   ```powershell
   Remove-Item -Recurse node_modules
   npm install
   ```

2. **Check Node.js version** (requires 18+)
   ```powershell
   node --version
   ```

3. **Install VC++ Build Tools** on Windows

### Python Dependencies Fail

**Solutions:**

1. **Use Python 3.10** (not 3.12+)
2. **Create virtual environment**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r python/requirements.txt
   ```

---

## Getting Help

If issues persist:

1. **Check logs**
   - Electron: DevTools Console
   - Python: Terminal output
   - Cloud: Platform dashboard logs

2. **Search existing issues** on GitHub

3. **Create new issue** with:
   - Error message
   - Steps to reproduce
   - Environment details (OS, Node version, Python version)
