# ⚠️ IMPORTANT: Cloud Backend URL Configuration

## Current Status

The desktop app is configured to connect to: `wss://api.interviewai.space`

However, this custom domain may not be set up yet. You have **two options**:

---

## Option 1: Use Direct Koyeb URL (Immediate)

### Step 1: Get Your Koyeb App URL

1. Go to: https://app.koyeb.com/
2. Log in to your account
3. Find your `interview-ai-backend` service
4. Copy the public URL (e.g., `interview-ai-backend-YOUR-ORG.koyeb.app`)

### Step 2: Update Desktop App Configuration

Edit `electron/config.js` and replace BOTH occurrences with your actual Koyeb URL:

```javascript
development: {
  serverUrl: process.env.USE_LOCAL_SERVER === 'true' 
    ? 'ws://localhost:8765' 
    : 'wss://YOUR-APP-NAME.koyeb.app',  // ← Change this
  // ...
},

production: {
  serverUrl: process.env.SERVER_URL || 'wss://YOUR-APP-NAME.koyeb.app',  // ← Change this
  // ...
}
```

**Example**: If your Koyeb URL is `interview-ai-backend-myorg.koyeb.app`, use:
```javascript
serverUrl: 'wss://interview-ai-backend-myorg.koyeb.app'
```

---

## Option 2: Set Up Custom Domain (Advanced)

### Step 1: Configure Custom Domain in Koyeb

1. Go to your Koyeb app dashboard
2. Navigate to Settings → Domains
3. Add custom domain: `api.interviewai.space`
4. Update your DNS records as instructed by Koyeb

### Step 2: Wait for DNS Propagation

- DNS changes can take 1-24 hours to propagate
- Verify with: `nslookup api.interviewai.space`

### Step 3: Test Connection

```powershell
# Test after DNS is configured
node test-cloud-ws.js
```

---

## 🚀 Quick Fix (Use This Now)

Since you need immediate testing, **Option 1** is recommended:

### 1. Get your Koyeb URL:

```powershell
# Option A: Check Koyeb dashboard
# Go to: https://app.koyeb.com/

# Option B: Check deployment docs
cat BACKEND_DEPLOYMENT_SUCCESS.md
```

### 2. Update config with actual URL:

```powershell
# Edit electron/config.js
# Replace api.interviewai.space with YOUR-APP.koyeb.app
```

### 3. Test connection:

```powershell
# Update test script with your URL
node test-cloud-ws.js
```

---

## 🔍 Finding Your Koyeb URL

If you deployed to Koyeb, the URL format is:
```
https://[app-name]-[org-name].koyeb.app
```

Check your:
- Koyeb dashboard
- Git commit messages
- Previous deployment logs

---

## ✅ After Updating URL

Once you have the correct URL, test the desktop app:

```powershell
# Test cloud connection
.\run-cloud.ps1

# Or
npm run cloud
```

---

## 📝 Current Files to Update

1. **`electron/config.js`** (line 7 and 20)
   - Replace `wss://api.interviewai.space`
   - With `wss://YOUR-ACTUAL-APP.koyeb.app`

2. **`test-cloud-ws.js`** (line 8)
   - Update test URL for verification

3. **All PowerShell scripts** (optional)
   - Update display messages if needed

---

## 🆘 Need Help?

If you don't remember your Koyeb URL:

1. Check Koyeb dashboard: https://app.koyeb.com/
2. Look at git history: `git log --grep=koyeb`
3. Search deployment files: `grep -r "koyeb.app" .`

---

**Next Step**: Get your actual Koyeb URL and update `electron/config.js`
