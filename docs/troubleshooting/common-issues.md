# Common Issues

## App Says API Keys Are Missing

Open Settings and add:

- Deepgram API key for transcription
- at least one AI provider key, or select Ollama with a running local Ollama server

Save settings and restart the backend from the app if prompted.

## Transcription Does Not Start

Check:

- Deepgram key is saved in Settings
- microphone permission is granted
- internet access is available for Deepgram
- the backend status shows running

## AI Answers Do Not Generate

Check:

- one AI provider key is saved
- the selected model name is valid for that provider
- the provider account has available usage
- the backend was restarted after changing keys

## Screen Capture Has No Text

Try:

- capture the specific interview/problem window
- increase the window zoom so text is readable
- use native Windows capture for restricted apps
- verify the bundled backend is running

## Production Build Fails

Run:

```powershell
npm install
npm run verify-build
npm run build:prod
```

`build:prod` requires Python 3.10+ on the build machine so PyInstaller can create the bundled backend.
