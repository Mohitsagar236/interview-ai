# Interview AI Documentation

Welcome to the Interview AI documentation. This guide covers everything from getting started to deploying your own instance.

## 📚 Documentation Structure

```
docs/
├── getting-started/          # Setup & configuration
│   ├── quick-start.md        # Get running in 10 minutes
│   ├── database-setup.md     # Supabase configuration
│   └── environment-configuration.md
│
├── deployment/               # Cloud deployment guides
│   ├── cloud-deployment.md   # Koyeb, Render, Railway, Fly.io
│   ├── vercel-deployment.md  # Frontend & API deployment
│   └── docker.md             # Docker containerization
│
├── features/                 # Feature documentation
│   ├── credits-system.md     # Time-based credits
│   ├── payment-integration.md # Razorpay setup
│   ├── desktop-activation.md # Activation codes
│   └── ai-quality.md         # AI response configuration
│
├── architecture/             # System design
│   ├── system-architecture.md # Component overview
│   └── improvement-roadmap.md # Planned improvements
│
├── api/                      # API reference
│   └── endpoints.md          # API documentation
│
└── troubleshooting/          # Problem solving
    └── common-issues.md      # FAQ & solutions
```

---

## 🚀 Quick Links

### Getting Started
- **[Quick Start Guide](getting-started/quick-start.md)** - Get running in 10 minutes
- **[Environment Configuration](getting-started/environment-configuration.md)** - Configure API keys
- **[Database Setup](getting-started/database-setup.md)** - Set up Supabase

### Deployment
- **[Cloud Deployment](deployment/cloud-deployment.md)** - Deploy backend (Koyeb, Render, etc.)
- **[Vercel Deployment](deployment/vercel-deployment.md)** - Deploy frontend & API
- **[Docker](deployment/docker.md)** - Containerized deployment

### Features
- **[Credits System](features/credits-system.md)** - How credits work
- **[Payment Integration](features/payment-integration.md)** - Razorpay setup
- **[Desktop Activation](features/desktop-activation.md)** - Activation codes
- **[AI Quality](features/ai-quality.md)** - Response configuration

### Architecture
- **[System Architecture](architecture/system-architecture.md)** - Component overview
- **[Improvement Roadmap](architecture/improvement-roadmap.md)** - Future plans

### Troubleshooting
- **[Common Issues](troubleshooting/common-issues.md)** - FAQ & solutions

---

## 🔧 Development

### Prerequisites
- Node.js 18+
- Python 3.10+
- Git

### Local Development
```bash
# Clone repository
git clone https://github.com/Mohitsagar236/interview-ai.git
cd interview-ai

# Install dependencies
npm install
pip install -r python/requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start development
npm run dev
```

### Useful Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode |
| `npm run build` | Build desktop app |
| `npm run test` | Run tests |
| `npm run cloud` | Use cloud backend |

---

## 📖 Additional Resources

- [GitHub Repository](https://github.com/Mohitsagar236/interview-ai)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [Deepgram Docs](https://developers.deepgram.com/)
- [Supabase Docs](https://supabase.com/docs)
- [Razorpay Docs](https://razorpay.com/docs/)
