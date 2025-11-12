# 🌐 Cloud-Only Desktop App Configuration

## ✅ Configuration Complete

Your desktop app is now configured to use **ONLY the cloud backend** by default!

### 📊 Current Setup

- **Default Mode**: Cloud Backend (`wss://api.interviewai.space`)
- **Development Mode**: Uses cloud (DevTools enabled)
- **Production Mode**: Uses cloud (DevTools disabled)
- **Local Mode**: Available via environment variable (optional)

---

## 🚀 Running the Desktop App

### Option 1: PowerShell Scripts (Recommended)

```powershell
# Run with cloud backend (development mode)
.\run-cloud.ps1

# Run with cloud backend (production mode)
.\run-cloud-prod.ps1

# Run with local backend (optional - requires Python server)
.\run-local.ps1
```

### Option 2: NPM Commands

```bash
# Run with cloud backend (default)
npm run cloud

# Run with cloud backend (development)
npm run dev:cloud

# Run with cloud backend (production)
npm run prod:cloud

# Run with local backend (requires Python server)
npm run dev:local
```

### Option 3: Direct Electron

```bash
# Cloud mode (default now)
npm start

# Force local mode
set USE_LOCAL_SERVER=true && npm start
```

---

## 🔧 Configuration Details

### Development Mode (Default: Cloud)
- **URL**: `wss://api.interviewai.space`
- **DevTools**: Enabled
- **Local Server**: Disabled
- **Use Case**: Testing features with cloud backend

### Production Mode
- **URL**: `wss://api.interviewai.space`
- **DevTools**: Disabled
- **Local Server**: Disabled
- **Use Case**: Production builds and releases

### Local Mode (Optional)
- **URL**: `ws://localhost:8765`
- **DevTools**: Enabled
- **Local Server**: Required
- **Use Case**: Backend development/testing
- **Enable with**: `set USE_LOCAL_SERVER=true`

---

## 🧪 Testing Cloud Connection

Run the test script to verify cloud backend is working:

```powershell
.\test-backend-connection.ps1
```

### Expected Results:
- ✅ Cloud backend responding
- ✅ WebSocket connection successful
- ✅ Desktop app configuration correct

---

## ⚙️ Files Modified

1. **`electron/config.js`**
   - Changed development mode default to cloud
   - Added `USE_LOCAL_SERVER` environment variable support

2. **`package.json`**
   - Added `cloud`, `dev:cloud`, `dev:local`, `prod:cloud` scripts

3. **PowerShell Scripts**
   - `run-cloud.ps1` - Run with cloud (dev mode)
   - `run-cloud-prod.ps1` - Run with cloud (prod mode)
   - `run-local.ps1` - Run with local server (optional)

---

## 🔍 Troubleshooting

### Desktop App Won't Connect

1. **Check cloud backend is running**:
   ```powershell
   curl https://api.interviewai.space/health
   ```

2. **Verify configuration**:
   ```powershell
   # Should show cloud URL
   npm start
   # Look for: [CONFIG] Server URL: wss://api.interviewai.space
   ```

3. **Check firewall**:
   - Ensure WSS (port 443) is not blocked
   - Try disabling antivirus temporarily

### Force Rebuild

If you made changes and they're not taking effect:

```powershell
# Clear cache and restart
npm start
```

### Check Logs

The desktop app logs will show:
```
[CONFIG] Running in development mode
[CONFIG] Server URL: wss://api.interviewai.space
[CONFIG] Cloud Mode: true
```

---

## 📝 Quick Reference

| Command | Mode | Backend | DevTools |
|---------|------|---------|----------|
| `npm run cloud` | Dev | Cloud | Yes |
| `npm run dev:cloud` | Dev | Cloud | Yes |
| `npm run prod:cloud` | Prod | Cloud | No |
| `npm run dev:local` | Dev | Local | Yes |
| `.\run-cloud.ps1` | Dev | Cloud | Yes |
| `.\run-cloud-prod.ps1` | Prod | Cloud | No |

---

## 🌟 Benefits of Cloud-Only Setup

✅ **No Local Setup**: No need to run Python server locally
✅ **Faster Development**: Start coding immediately
✅ **Production-Like**: Test against real deployment
✅ **Team Collaboration**: Everyone uses same backend
✅ **Consistent**: Same environment for all developers

---

## 📚 Additional Resources

- **Cloud Backend URL**: `wss://api.interviewai.space`
- **Backend Dashboard**: Check Koyeb for logs and status
- **Test Connection**: Run `.\test-backend-connection.ps1`

---

**Last Updated**: November 8, 2025
**Status**: ✅ Configured and Ready
