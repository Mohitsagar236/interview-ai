# Quick Start Guide

Get Interview AI running in under 10 minutes.

## Prerequisites

### Windows
- Node.js 18+
- Python 3.10+
- VC++ Build Tools (for some dependencies)

### API Keys (get from providers)
- **Required:** OpenRouter API key (for AI responses)
- **Required:** Deepgram API key (for transcription)
- **Optional:** OpenAI API key (for image generation)

---

## Option 1: Desktop App (Recommended)

### Download Pre-built App
1. Download installer from releases
2. Run installer
3. Launch app
4. Enter your activation code

### Build from Source
```powershell
# Clone repository
git clone https://github.com/Mohitsagar236/interview-ai.git
cd interview-ai

# Install dependencies
npm install

# Create .env file (copy from example)
copy .env.example .env
# Edit .env with your API keys

# Build the app
npm run build

# Run installer from dist/ folder
```

---

## Option 2: Development Mode

### Start Backend + Frontend
```powershell
# Install all dependencies
npm install
pip install -r python/requirements.txt

# Start development mode
npm run dev
```

This starts:
- Python WebSocket server on `ws://localhost:8765`
- Electron app in development mode

---

## Option 3: Cloud Backend

If you've deployed the backend to the cloud:

```powershell
# Run with cloud backend
npm run cloud

# Or use PowerShell script
.\run-cloud.ps1
```

---

## Environment Configuration

Create `.env` file in project root:

```bash
# AI Provider (Required)
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM=openai/gpt-4o-mini

# Transcription (Required)
DEEPGRAM_API_KEY=your_deepgram_key

# Database (Required for credits)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Payment (Optional)
RAZORPAY_KEY_ID=rzp_xxx
RAZORPAY_KEY_SECRET=your_secret

# Image Generation (Optional)
OPENAI_API_KEY=sk-xxx
ENABLE_IMAGE_GEN=1
```

---

## Testing Your Setup

### Test Python Server
```powershell
cd python
python -c "from server import HOST, PORT; print(f'Server: {HOST}:{PORT}')"
```

### Test Full Application
```powershell
npm run test:comprehensive
```

This tests:
- Server connectivity
- OCR functionality
- Resume parsing
- LLM connections

---

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode (local server) |
| `npm run cloud` | Development with cloud backend |
| `npm run build` | Build production app |
| `npm run build:prod` | Build for distribution |
| `npm start` | Start app (uses configured backend) |

---

## Next Steps

1. **[Database Setup](./database-setup.md)** - Set up Supabase
2. **[Cloud Deployment](../deployment/cloud-deployment.md)** - Deploy backend
3. **[Credits System](../features/credits-system.md)** - Configure credits
