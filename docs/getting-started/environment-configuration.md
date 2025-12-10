# Environment Configuration

All configuration is done through environment variables in the `.env` file.

## Quick Setup

```bash
# Copy example file
cp .env.example .env

# Edit with your values
notepad .env  # Windows
nano .env     # Linux/Mac
```

---

## Required Variables

### AI Provider
```bash
# OpenRouter (recommended - access to multiple models)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM=openai/gpt-4o-mini
```

### Transcription
```bash
# Deepgram for real-time speech-to-text
DEEPGRAM_API_KEY=your_deepgram_key
```

### Database
```bash
# Supabase for user data, credits, activations
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...  # Keep secret!
```

---

## Optional Variables

### Payment Gateway
```bash
# Razorpay for payment processing
RAZORPAY_KEY_ID=rzp_test_xxxxx  # or rzp_live_xxxxx
RAZORPAY_KEY_SECRET=your_secret_key
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

### Image Generation
```bash
# OpenAI for diagram generation
OPENAI_API_KEY=sk-xxxxx
ENABLE_IMAGE_GEN=1  # Set to 0 to disable
OPENAI_IMAGE_MODEL=gpt-image-1
```

### Cloud Deployment
```bash
# For cloud backend
CLOUD_MODE=true
HOST=0.0.0.0
PORT=8765
ALLOWED_ORIGINS=*
```

### Development
```bash
NODE_ENV=development  # or production
DEBUG=true
```

---

## Complete Example

```bash
# ===================
# AI Configuration
# ===================
OPENROUTER_API_KEY=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
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM=openai/gpt-4o-mini

# ===================
# Transcription
# ===================
DEEPGRAM_API_KEY=4bfe6cc554cfdef77f2adc9fc7d3ea140f10b24d

# ===================
# Database
# ===================
SUPABASE_URL=https://npdysfxewryqcmmztdxl.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ===================
# Payment (Optional)
# ===================
RAZORPAY_KEY_ID=rzp_test_abc123
RAZORPAY_KEY_SECRET=secret_xyz789
RAZORPAY_WEBHOOK_SECRET=whsec_abc123

# ===================
# Image Gen (Optional)
# ===================
OPENAI_API_KEY=sk-proj-xxxxx
ENABLE_IMAGE_GEN=1

# ===================
# Cloud Deployment
# ===================
CLOUD_MODE=false
HOST=localhost
PORT=8765
```

---

## Environment-Specific Files

For different environments, you can use:
- `.env.development` - Local development
- `.env.production` - Production deployment
- `.env.local` - Local overrides (gitignored)

---

## Security Notes

⚠️ **Never commit `.env` to git!**

The `.gitignore` should include:
```
.env
.env.local
.env.production
```

For CI/CD, use platform-specific secret management:
- **Vercel**: Project Settings → Environment Variables
- **Koyeb**: Service → Environment Variables
- **GitHub Actions**: Repository Secrets
