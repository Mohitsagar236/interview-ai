# Desktop App Backend Connection Guide

## Backend Options

Your desktop app can connect to:
1. **Cloud Backend (Koyeb)** - Recommended for production use
2. **Local Backend** - For development and offline use

## Configuration

The backend connection is controlled by the `USE_LOCAL_SERVER` environment variable in `.env`:

### Option 1: Cloud Backend (Koyeb) - DEFAULT
```env
USE_LOCAL_SERVER=false
```
Connects to: `wss://interview-ai-backend-mohitsagar236.koyeb.app`

### Option 2: Local Backend
```env
USE_LOCAL_SERVER=true
```
Connects to: `ws://localhost:8765`

## How to Use

### Cloud Backend (Default - Recommended)
```powershell
# Start desktop app with Koyeb cloud backend
npm start
# or
npm run cloud
```

### Local Backend (Development)
```powershell
# Start both local Python backend + desktop app
npm run start:local
# or
npm run dev
```

## Quick Commands

| Command | Description |
|---------|-------------|
| `npm start` | Desktop app with **cloud backend** (Koyeb) |
| `npm run cloud` | Same as `npm start` - cloud backend |
| `npm run start:local` | Desktop app with **local backend** (auto-starts Python) |
| `npm run dev` | Same as `start:local` - for development |
| `npm run dev:local` | Desktop app only (expects local backend running) |
| `npm run dev:cloud` | Desktop app only with cloud backend |

## Current Configuration

Your `.env` is now set to:
```env
USE_LOCAL_SERVER=false
```

This means `npm start` will connect to your Koyeb backend at:
**wss://interview-ai-backend-mohitsagar236.koyeb.app**

## Verification

### Cloud Backend (Koyeb)
The Electron console should show:
```
[CONFIG] Running in development mode
[CONFIG] Server URL: wss://interview-ai-backend-mohitsagar236.koyeb.app
[CONFIG] Cloud Mode: true
[Server] Cloud mode enabled - skipping local Python server
```

### Local Backend
The backend should show:
```
INFO:server:Server listening on ws://localhost:8765 (Cloud Mode: False)
```

The Electron console should show:
```
[CONFIG] Running in development mode
[CONFIG] Server URL: ws://localhost:8765
[CONFIG] Cloud Mode: false
[Server] Using venv Python: C:\...\interview-ai\.venv\Scripts\python.exe
```

## Troubleshooting

### Backend not starting
```powershell
# Check if Python venv exists
Test-Path .\.venv\Scripts\python.exe

# If not, set it up
npm run setup:py
```

### Port 8765 already in use
```powershell
# Find and kill the process
Get-Process -Name "python*" | Stop-Process -Force

# Then restart
npm run dev
```

### Still not connecting
1. Check the Electron console (F12 or Ctrl+Shift+I in the app)
2. Look for connection errors
3. Verify `.env` file has `USE_LOCAL_SERVER=true`
4. Restart the app completely

## Configuration Details

The app determines whether to use local or cloud backend based on:
1. `USE_LOCAL_SERVER` environment variable (from `.env` or command line)
2. `NODE_ENV` environment variable
3. Configuration in `electron/config.js`:
   - `development` mode → local server (`ws://localhost:8765`)
   - `production` mode → cloud server (`wss://interview-ai-backend-mohitsagar236.koyeb.app`)

## Files Modified
- `.env` - Added USE_LOCAL_SERVER and NODE_ENV
- `package.json` - Updated start and dev scripts
- `start-desktop-app.ps1` - Created new startup script (NEW)
