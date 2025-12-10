# Vercel Deployment Guide

Deploy the Interview AI frontend and serverless API functions to Vercel.

## Overview

Vercel hosts:
- **Static frontend** (`public/` folder)
- **Serverless API** (`api/` folder)

The Python WebSocket backend must be hosted separately (see [cloud-deployment.md](./cloud-deployment.md)).

---

## Prerequisites

- GitHub account
- Vercel account (free)
- Supabase project (for database)
- Razorpay account (for payments)

---

## Quick Start

### 1. Connect to Vercel

1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "New Project"
4. Import your `interview-ai` repository

### 2. Configure Build Settings

Vercel auto-detects configuration from `vercel.json`:

```json
{
  "version": 2,
  "buildCommand": "echo 'No build needed'",
  "outputDirectory": "public",
  "functions": {
    "api/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

### 3. Set Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Application
DOWNLOAD_URL=https://your-download-link.com/app.exe
```

### 4. Deploy

Click "Deploy" and wait for completion.

---

## API Endpoints

After deployment, your API is available at:

| Endpoint | Description |
|----------|-------------|
| `POST /api/create-razorpay-order` | Create payment order |
| `POST /api/verify-razorpay-payment` | Verify payment |
| `POST /api/razorpay-webhook` | Payment webhooks |
| `POST /api/activate-code` | Activate desktop app |
| `GET /api/get-credits-by-code` | Get user credits |

---

## Custom Domain

1. Go to Vercel Dashboard → Domains
2. Add your domain (e.g., `interviewai.space`)
3. Update DNS records as instructed
4. SSL is automatic

---

## Troubleshooting

### API Returns 500 Error
- Check Vercel Function Logs
- Verify environment variables are set
- Ensure Supabase connection is working

### CORS Issues
- Add appropriate headers in API functions
- Check `vercel.json` headers configuration

### Cold Starts
- Vercel serverless functions have cold starts
- Consider Edge Functions for faster response
