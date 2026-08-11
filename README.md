# Interview AI Assistant

Privacy-first desktop interview assistant owned by interviewai. Install the
app, add your own API keys locally, and use real-time transcription, screen
OCR, resume context, and AI coaching without an account or hosted backend.

## What Users Need

- Windows 10/11 x64
- A Deepgram API key for live transcription
- One AI provider key, or Ollama running locally

Supported AI providers include OpenAI, Anthropic, Gemini, Groq, OpenRouter,
xAI, Ollama, and custom OpenAI-compatible endpoints.

No subscription, activation code, Supabase project, database, or cloud server is
required for the desktop app. The app itself is free to use; users pay only
their chosen API providers, if those providers charge for usage.

## Download

Download the Windows installer from GitHub Releases:

https://github.com/Mohitsagar236/interview-ai/releases

After installing, open Settings in the desktop app and enter your own API keys.
Keys are stored locally and are sent only to the provider you configure.

## Features

- Real-time Deepgram transcription
- Multi-provider AI coaching
- Screen capture and OCR for coding or system-design prompts
- Resume and company context ingestion
- Local settings and local profile data
- Stealth-style desktop overlay
- Windows installer with bundled Python backend and OCR dependencies

## Developer Setup

Prerequisites:

- Node.js 20+
- Python 3.10 or 3.11
- Git

Install dependencies:

```powershell
npm install
npm run setup:py
```

Run the desktop app in development:

```powershell
npm run dev
```

The app can start without API keys, but transcription and AI answers require
keys configured in Settings or in a local `.env` file.

## Production Build

Build the self-contained Windows installer:

```powershell
npm run build:prod
```

This command:

- installs portable Python backend requirements
- builds `python-dist/interview-ai-server.exe` with PyInstaller
- packages the Electron desktop app with the bundled backend
- excludes `.env` and other local secrets from the installer

The installer is written to `dist/`.

## Verification

Run the production checks:

```powershell
npm test
npm run verify-build
npm run verify-prod
```

## Packaging Notes

The public desktop build intentionally excludes optional GPU/local-ML packages
such as `torch`, `transformers`, `bitsandbytes`, `faster-whisper`,
`sentence-transformers`, and `faiss`. This keeps the installer smaller and
avoids CUDA DLL warnings on normal end-user machines.

Resume and company context still work in the portable build through lightweight
text retrieval when embedding packages are not installed.

## Documentation

- [Quick Start](./docs/getting-started/quick-start.md)
- [Environment Configuration](./docs/getting-started/environment-configuration.md)
- [Troubleshooting](./docs/troubleshooting/common-issues.md)
- [Architecture](./docs/architecture/system-architecture.md)

## License

Interview AI is proprietary free-use software.

Copyright (c) 2025-2026 interviewai. All rights reserved.

Users may download, install, and use the app for free with their own API keys.
All ownership and rights not expressly granted remain with interviewai. See
[LICENSE.txt](./LICENSE.txt) for the full terms.
