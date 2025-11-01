# Cloud Deployment Architecture Guide

## Current vs. Target Architecture

### Current (Local-Only)
```
User's Computer:
├── Electron App (Frontend)
└── Python Server (localhost:8765) ← Problem: Runs locally
```

### Target (Cloud-Based)
```
User's Computer:
└── Electron App (Frontend)
        ↓ WebSocket
Cloud Server:
└── Python Backend (wss://your-domain.com)
```

---

## Implementation Steps

### Step 1: Make Backend Cloud-Compatible

#### 1.1 Update `renderer/toolbar.js` to support remote servers

**Current code (line 1483-1547):**
- Hardcoded `ws://localhost:${port}/ui`
- Only scans local ports 8765-8774

**Required changes:**
```javascript
// Add environment-based server URL
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'ws://localhost:8765';

// In connect() function, replace localhost with configurable URL
const ws = new WebSocket(`${SERVER_URL}/ui`);
```

#### 1.2 Add SSL/TLS support for production
- Change `ws://` to `wss://` for secure WebSocket connections
- Update Python server to support WSS with certificates

---

### Step 2: Deploy Backend to Cloud

#### Option A: Deploy to Render.com (Recommended for WebSockets)

**Why Render?**
- Native WebSocket support
- Free tier available
- Easy Python deployment
- Persistent storage

**Steps:**
1. Create `render.yaml` in project root:

```yaml
services:
  - type: web
    name: interview-ai-backend
    env: python
    buildCommand: "pip install -r python/requirements.txt"
    startCommand: "python python/server.py"
    envVars:
      - key: PORT
        value: 8765
      - key: OPENAI_API_KEY
        sync: false  # Set manually in dashboard
      - key: DEEPGRAM_API_KEY
        sync: false
```

2. Push to GitHub and connect to Render
3. Set environment variables in Render dashboard
4. Get your app URL: `https://interview-ai-backend.onrender.com`

#### Option B: Deploy to Railway.app

```json
// railway.json
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

#### Option C: Deploy to Fly.io (Advanced)

```toml
# fly.toml
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

### Step 3: Update Electron App Configuration

#### 3.1 Create environment configuration file

**Create `electron/config.js`:**
```javascript
const config = {
  development: {
    serverUrl: 'ws://localhost:8765',
    useLocalServer: true
  },
  production: {
    serverUrl: 'wss://your-backend.onrender.com',
    useLocalServer: false
  }
};

const env = process.env.NODE_ENV || 'development';
module.exports = config[env];
```

#### 3.2 Update `electron/main.js`

**Add after dotenv loading (around line 40):**
```javascript
const config = require('./config');

// Only start local Python server in development mode
if (config.useLocalServer) {
  startPythonServer();
} else {
  console.log('[MAIN] Using cloud backend:', config.serverUrl);
}
```

#### 3.3 Update `renderer/toolbar.js`

**Replace the `connect()` function (lines 1472-1608):**
```javascript
function connect() {
  console.log("Attempting to connect to server...");
  
  // Check if we should use cloud server
  const cloudMode = window.electronAPI?.getConfig?.()?.cloudMode;
  const serverUrl = window.electronAPI?.getConfig?.()?.serverUrl;
  
  if (cloudMode && serverUrl) {
    // Cloud mode: connect to remote server
    connectToCloud(serverUrl);
  } else {
    // Local mode: scan localhost ports
    connectToLocalhost();
  }
}

function connectToCloud(baseUrl) {
  try {
    const ws = new WebSocket(`${baseUrl}/ui`);
    state.ws = ws;
    
    ws.onopen = () => {
      console.log(`Connected to cloud server: ${baseUrl}`);
      setConnected(true);
      // ... rest of onopen handler
    };
    
    ws.onerror = (e) => {
      console.error('Cloud WebSocket error:', e);
      showNotification('Failed to connect to cloud server', 'error');
      scheduleReconnect();
    };
    
    ws.onclose = () => {
      console.log('Cloud WebSocket closed');
      setConnected(false);
      scheduleReconnect();
    };
    
    ws.onmessage = (ev) => {
      // ... existing message handler
    };
  } catch (e) {
    console.error('Failed to connect to cloud:', e);
    scheduleReconnect();
  }
}

function connectToLocalhost() {
  // ... existing localhost scanning logic
}
```

---

### Step 4: Update Build Process

#### 4.1 Modify `package.json` build scripts:

```json
{
  "scripts": {
    "build:dev": "electron-builder --config electron-builder-dev.json",
    "build:prod": "NODE_ENV=production electron-builder --config electron-builder-prod.json",
    "build": "npm run build:prod"
  }
}
```

#### 4.2 Create `electron-builder-prod.json`:

```json
{
  "extends": null,
  "appId": "com.interviewai.app",
  "productName": "Interview AI",
  "files": [
    "electron/**/*",
    "renderer/**/*",
    "assets/**/*",
    "package.json"
  ],
  "extraMetadata": {
    "main": "electron/main.js",
    "env": {
      "NODE_ENV": "production",
      "SERVER_URL": "wss://your-backend.onrender.com"
    }
  },
  "win": {
    "target": ["nsis"]
  }
}
```

**Note:** Python files are excluded - no longer bundled with production builds!

---

### Step 5: Update Python Server for Cloud

#### 5.1 Modify `python/server.py` to support cloud hosting:

**Add at the top (after imports):**
```python
import os

# Cloud deployment configuration
CLOUD_MODE = os.getenv('CLOUD_MODE', 'false').lower() == 'true'
PORT = int(os.getenv('PORT', 8765))
HOST = '0.0.0.0' if CLOUD_MODE else 'localhost'

# CORS configuration for cloud
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '*').split(',')
```

**Update WebSocket server initialization (around line 3500):**
```python
async def main():
    logger.info(f"Starting server on {HOST}:{PORT} (Cloud Mode: {CLOUD_MODE})")
    
    async with websockets.serve(
        handle_ui,
        HOST,
        PORT,
        max_size=50 * 1024 * 1024,
        ping_interval=20,
        ping_timeout=10,
        compression=None,
        origins=ALLOWED_ORIGINS if CLOUD_MODE else None
    ):
        logger.info(f"✅ Server ready at ws://{HOST}:{PORT}")
        await asyncio.Future()  # run forever
```

#### 5.2 Create `python/requirements-cloud.txt`:

```txt
# Cloud-specific requirements (no Windows-only packages)
asyncio
websockets>=12.0
python-dotenv
openai
anthropic
groq
deepgram-sdk
numpy
pillow
pytesseract
pypdf
python-docx
sentence-transformers
chromadb
```

---

### Step 6: Security Considerations

#### 6.1 Add authentication for cloud backend

**Option 1: API Key Authentication**
```python
# In python/server.py
async def handle_ui(websocket, path):
    # Verify API key from client
    try:
        api_key = websocket.request_headers.get('X-API-Key')
        if not verify_api_key(api_key):
            await websocket.close(code=1008, reason="Invalid API key")
            return
    except Exception as e:
        logger.error(f"Auth error: {e}")
        return
    
    # ... rest of handler
```

**Option 2: JWT Tokens**
```python
import jwt

async def handle_ui(websocket, path):
    try:
        token = websocket.request_headers.get('Authorization')
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        user_id = payload['user_id']
    except jwt.InvalidTokenError:
        await websocket.close(code=1008, reason="Invalid token")
        return
```

#### 6.2 Update Electron app to send credentials

**In `renderer/toolbar.js`:**
```javascript
function connectToCloud(baseUrl) {
  const apiKey = window.electronAPI.getApiKey();
  
  const ws = new WebSocket(`${baseUrl}/ui`, {
    headers: {
      'X-API-Key': apiKey
    }
  });
  
  // ... rest of connection logic
}
```

---

### Step 7: Environment Variables Management

#### 7.1 For Development (local .env):
```env
NODE_ENV=development
CLOUD_MODE=false
SERVER_URL=ws://localhost:8765
```

#### 7.2 For Production (Render/Railway):
```env
NODE_ENV=production
CLOUD_MODE=true
PORT=8765
ALLOWED_ORIGINS=https://your-website.com
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
```

#### 7.3 For Electron App (packaged):
- Remove `.env` from builds (no longer needed)
- Use Electron's `safeStorage` API for API keys if needed locally

---

## Testing the Cloud Setup

### Local Testing
```bash
# Terminal 1: Start cloud-mode server locally
cd python
$env:CLOUD_MODE="true"; $env:HOST="0.0.0.0"; python server.py

# Terminal 2: Build and test Electron app
npm run build:prod
```

### Cloud Testing
1. Deploy backend to Render
2. Update `electron-builder-prod.json` with your Render URL
3. Build app: `npm run build:prod`
4. Install and test on fresh machine

---

## Migration Path

### Phase 1: Dual Mode (Backward Compatible)
- Keep local server as default
- Add cloud option in settings
- Users can choose local or cloud

### Phase 2: Cloud-First
- Cloud by default
- Local server as fallback option

### Phase 3: Cloud-Only
- Remove Python bundling from Electron
- Smaller app size
- Easier updates

---

## Cost Estimates

### Render.com
- **Free tier**: 750 hours/month (enough for testing)
- **Starter**: $7/month (1GB RAM, always-on)
- **Standard**: $25/month (4GB RAM, auto-scaling)

### Railway.app
- **Free**: $5 credit/month
- **Hobby**: $5/month + usage
- **Pro**: $20/month + usage

### Fly.io
- **Free**: 3 shared VMs
- **Paid**: ~$2/month per VM

---

## Next Steps

1. ✅ Choose cloud provider (Render recommended)
2. ✅ Update `toolbar.js` with cloud connection logic
3. ✅ Deploy backend to cloud
4. ✅ Test WebSocket connectivity
5. ✅ Update Electron build configuration
6. ✅ Add authentication layer
7. ✅ Build and distribute app

---

## Support Resources

- **Render Docs**: https://render.com/docs/web-services
- **Railway Docs**: https://docs.railway.app/
- **WebSocket Security**: https://websocket.org/security
- **Electron Environment Variables**: https://www.electronjs.org/docs/api/environment-variables

