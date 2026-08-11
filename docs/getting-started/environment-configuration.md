# Environment Configuration

Interview AI is a proprietary free-use BYOK desktop app owned by interviewai. End users do not need to create a `.env` file when they install the packaged app. They open Settings, paste their own API keys, and the app stores those keys locally with Electron secure storage.

## End User Setup

Required for full functionality:

| Key | Purpose | Where to configure |
| --- | --- | --- |
| Deepgram API key | Live transcription | Desktop app Settings |
| One AI provider key | AI answers and coaching | Desktop app Settings |

Supported AI providers:

| Provider | Notes |
| --- | --- |
| OpenRouter | Recommended; one key can access many models |
| OpenAI | Direct GPT access |
| Anthropic | Claude API key |
| Gemini | Google Gemini OpenAI-compatible endpoint |
| Groq | Fast hosted open-source models |
| xAI | Grok models |
| Ollama | Local endpoint; no API key required |
| Custom | Any OpenAI-compatible endpoint |

## Developer `.env`

Developers may copy `.env.example` to `.env` for local development. Never commit `.env`, and never package it in production builds.

Minimal local development example:

```env
USE_LOCAL_SERVER=true
BYOK_MODE=true

OPENROUTER_API_KEY=replace_with_your_key
DEEPGRAM_API_KEY=replace_with_your_key
DEFAULT_LLM=openai/gpt-4o-mini
```

Ollama-only local development:

```env
USE_LOCAL_SERVER=true
BYOK_MODE=true
OPENAI_BASE_URL=http://localhost:11434/v1
DEFAULT_LLM=llama3
```

## Production Builds

Production installers should be built with:

```powershell
npm run build:prod
```

This builds the Python backend into `python-dist/` and packages it with Electron. The packaged app must not include `.env`; users provide their own keys through Settings.
