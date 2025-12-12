# GitHub Releases Migration Guide

## Why GitHub Releases?

Your Vercel Blob storage hit its limits:
- ❌ **Hobby Plan**: 1 GB storage + 10 GB bandwidth/month
- ❌ **Access blocked until September 2026**
- ✅ **GitHub Releases**: **UNLIMITED storage & bandwidth** for releases (FREE!)

## Setup Instructions

### 1. Create GitHub Personal Access Token

1. Go to https://github.com/settings/tokens/new
2. Token name: `Interview AI Release Uploader`
3. Select scopes:
   - ✅ `public_repo` (for public repositories)
4. Click "Generate token"
5. Copy the token (starts with `ghp_`)

### 2. Add Token to .env File

Add this line to your `.env` file:
```
GITHUB_TOKEN=ghp_your_token_here
```

### 3. Build and Upload

```bash
# Build the application
npm run build

# Upload to GitHub Releases
npm run upload:github

# Or do both at once:
npm run release
```

## What Changed

### Files Updated ✅

1. **[api/download.js](api/download.js)** - Download endpoint now points to GitHub
2. **[api/payment-webhook.js](api/payment-webhook.js)** - Payment webhooks use GitHub URLs
3. **[api/razorpay-webhook.js](api/razorpay-webhook.js)** - Razorpay webhooks use GitHub URLs
4. **[public/payment-razorpay.js](public/payment-razorpay.js)** - Payment page uses GitHub URLs
5. **[package.json](package.json)** - Added upload and release scripts

### New Scripts Created ✅

- **[scripts/upload-to-github.js](scripts/upload-to-github.js)** - Uploads installers to GitHub Releases

## Benefits

| Feature | Vercel Blob (Hobby) | GitHub Releases |
|---------|---------------------|-----------------|
| Storage | 1 GB | **Unlimited** |
| Bandwidth | 10 GB/month | **Unlimited** |
| Cost | $0 (blocked) | **$0 (FREE!)** |
| CDN | Yes | **Yes (global)** |
| Perfect for | Web assets | **Desktop apps** ✅ |

## Usage

### Upload New Build

1. Make your changes
2. Build: `npm run build`
3. Upload: `npm run upload:github`

### View Releases

Visit: https://github.com/Mohitsagar236/interview-ai/releases

## Old Vercel Blob Scripts (Deprecated)

These scripts are no longer needed but kept for reference:
- `scripts/upload-to-blob.js` ❌
- `scripts/upload-latest.js` ❌
- `scripts/cleanup-blob.js` ❌
- `scripts/update-blob.js` ❌

## Next Steps

1. ✅ Set up GITHUB_TOKEN in .env
2. ✅ Build your app: `npm run build`
3. ✅ Upload to GitHub: `npm run upload:github`
4. 🎉 Your downloads now have unlimited bandwidth!

## Notes

- GitHub Releases is industry standard for desktop app distribution
- Used by: VS Code, Atom, Discord, Slack, and thousands of apps
- Automatic CDN distribution worldwide
- No bandwidth charges ever!
