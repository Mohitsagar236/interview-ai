# System Architecture

Interview AI is a local-first desktop application.

## Desktop Runtime

```text
Electron app
  -> starts bundled Python backend from python-dist/
  -> opens dashboard/settings/toolbar windows
  -> captures screen/audio through Electron APIs

Python backend
  -> WebSocket server on localhost
  -> OCR and vision processing
  -> Deepgram streaming transcription
  -> OpenAI-compatible AI provider streaming
```

## Key Components

| Area | Files | Purpose |
| --- | --- | --- |
| Electron main process | `electron/main.js` | Starts backend, manages windows, IPC, shortcuts, capture |
| Secure settings | `electron/settings-store.js` | Stores BYOK keys locally with secure storage when available |
| Toolbar UI | `renderer/toolbar.html`, `renderer/toolbar.js` | Main interview controls, capture, transcript, AI answers |
| Settings UI | `renderer/settings.html`, `renderer/settings.js` | Provider key/model configuration |
| Backend server | `python/server.py` | WebSocket routing, OCR, prompt assembly, AI streaming |
| AI providers | `python/ai_providers.py` | OpenAI-compatible provider adapters |
| Transcription | `python/streaming_transcription.py` | Deepgram streaming transcription |
| OCR | `python/paddleocr_engine.py`, `python/ocr_utils.py` | Screen text extraction |

## Packaging

Production builds use PyInstaller to create `python-dist/interview-ai-server.exe`, then Electron Builder packages that executable with the desktop app.

The packaged app should include:

- Electron runtime
- renderer assets
- bundled Python backend
- bundled Tesseract fallback assets
- no `.env` file
- no account/payment/activation dependency

## Public Website

The website is static marketing/docs/download content plus a lightweight
`/api/download` redirect. The desktop app does not require a hosted API for
normal local operation.
