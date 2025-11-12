# 🎯 QUICK START: Desktop App with Cloud Backend

## Current Status: ✅ Configured | ⚠️ URL Needs Verification

---

## What You Have Now

✅ Desktop app configured for cloud-only operation  
✅ No local Python server required  
✅ Easy run scripts created  
✅ Test tools available  
⚠️ Backend URL needs verification

---

## ⚡ Quick Fix (Do This First)

### Step 1: Get Your Koyeb URL
```
🌐 Visit: https://app.koyeb.com/
📍 Find: interview-ai-backend service
📋 Copy: The public URL (e.g., my-app-abc123.koyeb.app)
```

### Step 2: Update Config
```powershell
# Open: electron/config.js
# Find line 7 and 20:
serverUrl: 'wss://api.interviewai.space'

# Replace with your Koyeb URL:
serverUrl: 'wss://your-actual-app.koyeb.app'
```

### Step 3: Test Connection
```powershell
# Update test-cloud-ws.js line 8 with your URL
# Then run:
node test-cloud-ws.js
```

### Step 4: Run Desktop App
```powershell
# Run the app with cloud backend:
.\run-cloud.ps1

# Or:
npm run cloud
```

---

## 🚀 Running the App (All Options)

```powershell
# Option 1: PowerShell script (recommended)
.\run-cloud.ps1              # Development with cloud

# Option 2: NPM commands
npm run cloud                # Development with cloud
npm run dev:cloud            # Same as above
npm run prod:cloud           # Production with cloud

# Option 3: Default start (now uses cloud)
npm start

# Optional: Use local server instead
.\run-local.ps1              # Requires Python server running
npm run dev:local            # Same as above
```

---

## 🔍 How to Find Your Koyeb URL

### Method 1: Koyeb Dashboard (Easiest)
```
1. Go to https://app.koyeb.com/
2. Log in
3. Click on your service
4. Look for "Public domains" section
5. Copy the .koyeb.app URL
```

### Method 2: Check Git History
```powershell
git log --all --oneline --grep="koyeb"
```

### Method 3: Check Deployment Docs
```powershell
cat BACKEND_DEPLOYMENT_SUCCESS.md
```

---

## 📝 Files That Changed

| File | What Changed |
|------|--------------|
| `electron/config.js` | Now uses cloud by default |
| `package.json` | Added cloud/local scripts |
| `run-cloud.ps1` | New: Run with cloud |
| `run-cloud-prod.ps1` | New: Run with cloud (prod) |
| `run-local.ps1` | New: Run with local server |
| `test-cloud-ws.js` | New: Test cloud connection |

---

## ✅ Configuration Summary

### Before:
```javascript
// Development used local server
serverUrl: 'ws://localhost:8765'
useLocalServer: true
cloudMode: false
```

### After:
```javascript
// Development now uses cloud
serverUrl: 'wss://api.interviewai.space'  // ← Update this!
useLocalServer: false
cloudMode: true
```

---

## 🧪 Testing Checklist

- [ ] Get Koyeb URL from dashboard
- [ ] Update `electron/config.js` (line 7, 20)
- [ ] Update `test-cloud-ws.js` (line 8)
- [ ] Run `node test-cloud-ws.js` (should show ✅)
- [ ] Run `.\run-cloud.ps1` or `npm run cloud`
- [ ] App should start and connect
- [ ] Test interview features

---

## 🆘 Troubleshooting

### "Connection failed: 404"
→ URL is wrong. Get correct Koyeb URL from dashboard.

### "Backend may be down"
→ Check if your Koyeb service is running at https://app.koyeb.com/

### "Can't find run-cloud.ps1"
→ Make sure you're in the project root directory.

### "npm run cloud not found"
→ Run `npm install` first to update package.json.

---

## 💡 Pro Tips

1. **Development**: Use `.\run-cloud.ps1` (has DevTools)
2. **Production Testing**: Use `.\run-cloud-prod.ps1`
3. **Backend Development**: Use `.\run-local.ps1` (requires Python server)
4. **Quick Test**: Run `node test-cloud-ws.js` before starting app

---

## 📚 Documentation

- `CLOUD_SETUP_COMPLETE.md` - Full configuration details
- `CLOUD_ONLY_SETUP.md` - Complete usage guide
- `CLOUD_URL_SETUP.md` - URL configuration help

---

## 🎯 Your Next Action

```powershell
# 1. Get your Koyeb URL
Start-Process "https://app.koyeb.com/"

# 2. Edit config
notepad electron\config.js

# 3. Test
node test-cloud-ws.js

# 4. Run app
.\run-cloud.ps1
```

---

**Last Updated**: November 8, 2025  
**Status**: ✅ Configured | ⚠️ URL verification needed  
**Time to Fix**: ~5 minutes
