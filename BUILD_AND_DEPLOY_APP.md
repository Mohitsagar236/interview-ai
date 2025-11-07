# Desktop App Build and Deploy Guide

## 🚀 Build the Desktop App

### Step 1: Build for Windows

```powershell
# Make sure you're in the project directory
cd C:\Users\cp813\Desktop\interview-ai

# Build the Windows installer
npm run build:prod
```

This will create:
- `dist/Interview AI Setup 0.1.0.exe` - Windows installer

### Step 2: Upload to GitHub Releases

1. **Go to your GitHub repository**: https://github.com/Mohitsagar236/interview-ai
2. **Click "Releases"** → **"Create a new release"**
3. **Tag version**: `v0.1.0`
4. **Release title**: `Interview AI v0.1.0`
5. **Upload the built files**:
   - `dist/Interview AI Setup 0.1.0.exe`
6. **Click "Publish release"**

### Step 3: Get Download URLs

After publishing, you'll get URLs like:
```
https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview.AI.Setup.0.1.0.exe
```

## 📦 Alternative: Use Vercel Blob Storage

If you want to host on Vercel:

1. Go to Vercel Dashboard → Your Project → Storage → Create Blob Store
2. Upload your `.exe` file
3. Get the public URL

## 🔧 Update Download Links

The download links are in `public/download.js`:

```javascript
const DOWNLOAD_URLS = {
    windows: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview.AI.Setup.0.1.0.exe',
    mac: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/Interview-AI-0.1.0.dmg',
    linux: 'https://github.com/Mohitsagar236/interview-ai/releases/download/v0.1.0/interview-ai-0.1.0.AppImage'
};
```

## 🎯 Quick Build Command

```powershell
npm run build:prod
```

This creates a production-ready installer with:
- ✅ Code signing (if configured)
- ✅ Auto-updates
- ✅ Activation system
- ✅ Credit management
