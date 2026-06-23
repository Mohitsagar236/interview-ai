# Quick Start

Interview AI is designed for normal desktop users: install the app, add your own API keys, and use it locally. No account, activation code, subscription, database, or separate backend command is required.

## Install the Desktop App

1. Open the download page.
2. Download the Windows installer.
3. Run the installer.
4. Launch Interview AI.
5. Open Settings and add:
   - a Deepgram API key for live transcription
   - one AI provider key, such as OpenRouter, OpenAI, Anthropic, Gemini, Groq, or xAI

The desktop installer includes the Electron app and Python backend. You do not need to install Python packages manually.

## Use the App

1. Click Settings and save your keys.
2. Start the toolbar.
3. Use Record Interviewer for live transcription.
4. Use Capture for screen/OCR context.
5. Click Ask AI to generate an answer from the current transcript or capture.

## Build From Source

Development prerequisites:

- Node.js 18+
- Python 3.10+
- Git

```powershell
git clone https://github.com/Mohitsagar236/interview-ai.git
cd interview-ai
npm install
npm run setup:py
npm run dev
```

## Build a Production Installer

```powershell
npm run build:prod
```

This command builds the standalone Python backend first, then packages the desktop app.

## Notes

- `.env` is optional for developers and must not be shipped in production installers.
- Ollama can be used without an API key if Ollama is already running locally.
- The packaged app stores keys locally using Electron secure storage.
