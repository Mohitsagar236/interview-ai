# Deploy R2 Changes to Vercel

## Step 1: Add Environment Variable to Vercel ⚠️ REQUIRED

1. Go to: https://vercel.com/dashboard
2. Select your project: **interview-ai**
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add:
   - **Name**: `R2_PUBLIC_URL`
   - **Value**: `https://pub-bd0f8fce43ae498088abfcbd6d669f15.r2.dev`
   - **Environments**: Check all (Production, Preview, Development)
6. Click **Save**

## Step 2: Force Redeploy

Since git says "nothing to commit", the changes might already be on Vercel but without the environment variable.

### Option A: Trigger Redeploy on Vercel Dashboard
1. Go to your project on Vercel
2. Go to **Deployments** tab
3. Click the **three dots** (•••) on the latest deployment
4. Click **Redeploy**
5. Select **Use existing build cache: No**
6. Click **Redeploy**

### Option B: Make a Dummy Commit (if Option A doesn't work)
```bash
git commit --allow-empty -m "Trigger redeploy with R2 env var"
git push
```

## Step 3: Verify

After deployment completes, go to your site and click download. It should now use:
```
https://pub-bd0f8fce43ae498088abfcbd6d669f15.r2.dev/...
```

Instead of:
```
iylx1o61xprr6qlb.public.blob.vercel-storage.com/... (BLOCKED)
```

## Quick Test

Try this direct link in your browser:
```
https://pub-bd0f8fce43ae498088abfcbd6d669f15.r2.dev/releases/v0.1.0/Interview-AI-Setup-0.1.0-x64.exe
```

Should download immediately! ✅
