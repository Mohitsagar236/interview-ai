# Cloudflare R2 Setup Guide

## Step 1: Create Cloudflare Account & R2 Bucket

1. **Sign up for Cloudflare** (if you don't have an account):
   - Go to https://dash.cloudflare.com/sign-up
   - It's FREE! No credit card required for the free tier

2. **Enable R2 Object Storage**:
   - In Cloudflare Dashboard, go to **R2 Object Storage** (left sidebar)
   - Click "Get Started" or "Create Bucket"

3. **Create a bucket**:
   - Bucket name: `interview-ai-releases`
   - Location: Choose closest to your users (or leave default)
   - Click "Create Bucket"

## Step 2: Enable Public Access

1. In your bucket, go to **Settings** tab
2. Scroll to **Public Access**
3. Click "Connect Domain" or "Allow Access"
4. You'll get a public URL like: `https://pub-xxxxxxxxxxxxx.r2.dev`
5. **Copy this URL** - you'll need it!

## Step 3: Create API Token

1. Go to **R2** → **Manage R2 API Tokens**
2. Click "Create API Token"
3. Settings:
   - **Token name**: `Interview AI Uploader`
   - **Permissions**: Admin Read & Write
   - **TTL**: Never expires (or set as needed)
4. Click "Create API Token"
5. **Copy these values** (you won't see them again!):
   - Access Key ID
   - Secret Access Key
   - Your Account ID is also shown

## Step 4: Add to .env File

Add these lines to your `.env` file:

```env
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=interview-ai-releases
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxxx.r2.dev
```

**Replace with your actual values!**

## Step 5: Upload Your Installers

```bash
# Make sure you've built the app first
npm run build

# Upload to R2
npm run upload:r2
```

The script will output your public download URLs!

## Step 6: Update Environment Variable on Vercel

1. Go to https://vercel.com/your-project/settings/environment-variables
2. Add `R2_PUBLIC_URL` with your public R2 URL
3. Redeploy your site

## What You Get (FREE Tier)

✅ **10 GB storage** - Enough for 20+ installers  
✅ **10 million requests/month** - More than enough  
✅ **NO EGRESS FEES** - Unlimited downloads!  
✅ **Global CDN** - Fast downloads worldwide  
✅ **$0/month** - Completely FREE until you exceed limits  

## Pricing After Free Tier

If you exceed 10 GB storage:
- **$0.015 per GB/month** = ~$0.015/GB
- Still 100x cheaper than Vercel!
- **Still NO bandwidth fees!**

Example: 50 GB storage = $0.75/month

## Testing Your Setup

After uploading, test a download URL:
```
https://pub-xxxxxxxxxxxxx.r2.dev/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe
```

Open in browser - it should download your installer!

## Troubleshooting

**Error: "Access Denied"**
→ Make sure public access is enabled on your bucket

**Error: "No such key"**
→ Check the file path in your R2 bucket

**Upload fails**
→ Verify your API credentials in `.env`

## Need Help?

- Cloudflare R2 Docs: https://developers.cloudflare.com/r2/
- R2 Pricing: https://developers.cloudflare.com/r2/pricing/

---

**🎉 Once set up, you'll have unlimited downloads for FREE!**
