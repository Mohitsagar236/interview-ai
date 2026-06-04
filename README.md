# Interview AI Assistant

**100% Open Source & Free** — Privacy-first interview coach that runs entirely on your machine. Bring your own AI API key (OpenAI, OpenRouter, Groq, xAI) and Deepgram key for real-time transcription.

Features: real-time streaming transcription, multi-LLM AI coaching (GPT-4o, Claude, Llama, Gemini), screen capture with OCR for coding problems, resume parsing, and stealth overlay.

> **No account, no subscription, no cloud dependency.** Just add your API keys and go.

## 📚 Documentation

| Section | Description |
|---------|-------------|
| **[Quick Start](./docs/getting-started/quick-start.md)** | Get running in 10 minutes |
| **[Environment Setup](./docs/getting-started/environment-configuration.md)** | Configure API keys |
| **[Troubleshooting](./docs/troubleshooting/common-issues.md)** | Common issues & solutions |
| **[Architecture](./docs/architecture/system-architecture.md)** | System design overview |

## 🔑 API Keys - Bring Your Own!

This app requires you to provide your own API keys. **Your keys stay on your machine and are never sent anywhere except directly to the API providers.**

### Required Keys

| Service | Purpose | Get Your Key |
|---------|---------|--------------|
| **OpenRouter** (Recommended) | AI responses (access to 100+ models) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Deepgram** | Real-time speech transcription | [console.deepgram.com](https://console.deepgram.com/signup) |

### Alternative AI Providers (Optional)

| Service | Purpose | Get Your Key |
|---------|---------|--------------|
| OpenAI | Direct GPT access | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | Claude models | [console.anthropic.com](https://console.anthropic.com/) |
| Groq | Ultra-fast inference | [console.groq.com/keys](https://console.groq.com/keys) |
| X.AI | Grok models | [x.ai](https://x.ai/) |

### How to Configure API Keys

**Option 1: In-App Settings (Easiest)**
1. Launch the application
2. Click the ⚙️ **Settings** button in the toolbar
3. Enter your API keys
4. Click **Save & Restart**

**Option 2: Environment File**
Create a `.env` file in the project root:
```bash
# Required - Choose one AI provider
OPENROUTER_API_KEY=sk-or-v1-your-key-here
# OR
OPENAI_API_KEY=sk-your-key-here

# Required for transcription
DEEPGRAM_API_KEY=your-deepgram-key

# Optional settings
DEFAULT_LLM=openai/gpt-4o-mini
OPENAI_BASE_URL=https://openrouter.ai/api/v1
```

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Python 3.10+** — [python.org](https://www.python.org/downloads/)
- **Git** — [git-scm.com](https://git-scm.com)

### 1. Clone and install
```bash
git clone https://github.com/Mohitsagar236/interview-ai.git
cd interview-ai
npm install
pip install -r python/requirements.txt
```

### 2. Configure API keys
```bash
cp .env.example .env
```
Edit `.env` and add your API keys (at minimum, one AI key):
```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here   # or use OPENAI_API_KEY, GROQ_API_KEY
DEEPGRAM_API_KEY=your-deepgram-key-here      # for voice transcription
```

### 3. Run the app
```bash
npm run dev
```
This starts the Python backend and launches the Electron desktop app.

### Alternative: Configure keys in the app
1. Run `npm run dev` (app will start without AI features)
2. Click the **⚙️ Settings** button in the toolbar
3. Enter your API keys
4. Click **Save & Restart**

### Pre-built Desktop App
Download from [Releases](https://github.com/Mohitsagar236/interview-ai/releases), install, then configure API keys in Settings.

## Features

### 🎯 ChatGPT-Style Response Quality
The AI assistant follows ChatGPT's response principles:
- **No instruction repetition** - Gets straight to the point
- **Context-aware responses** - Considers your resume and interview context
- **Proper formatting** - Uses headings, bullets, and structured answers
- **Complete coverage** - Never skips parts of your questions

See [AI Quality docs](./docs/features/ai-quality.md) for details.

### Automatic Illustrative Image Generation (Experimental)
When the assistant detects that a user question or captured screen context explicitly asks for a visual (e.g. includes terms like "diagram", "architecture", "flowchart", "timeline", "graph", "wireframe"), it will attempt to generate a minimal illustrative image automatically.

Environment variables:
 - `OPENAI_API_KEY` (required for image generation)
 - `ENABLE_IMAGE_GEN=1` (default on; set to `0` to disable)
 - `OPENAI_IMAGE_MODEL` (optional, default: `gpt-image-1`)

How it works:
 1. Heuristic scans prompt/context for visualization keywords.
 2. If matched and provider initialized, a single diagram-style image is requested.
 3. The renderer displays it inline with an `image_result` chat message.

Safeguards:
 - Falls back silently if API not configured or request fails.
 - Keeps prompt truncated to 500 chars for image generation clarity.

Limitations:
 - Illustrations are conceptual, not exact UML spec.
 - Currently only supports OpenAI Images endpoint.
 - No caching yet; repeated similar prompts may regenerate.

Disable quickly by setting `ENABLE_IMAGE_GEN=0` or removing `OPENAI_API_KEY`.

## Prereqs (Windows)
- Node.js 18+
- Python 3.10+
- VC++ Build Tools (for some deps) and FFmpeg if needed by your audio stack
- Optional GPU: install appropriate onnxruntime-gpu if you run local models.
  
Note: real-time streaming transcription is configured to use Deepgram by default. Set `DEEPGRAM_API_KEY` in your environment or `.env` to enable Deepgram streaming.

## Setup
```
## Getting C++ / Code Answers

The coach mode now detects when you request programming help. To receive a properly formatted C++ solution:

Ask a question that clearly indicates you want code, for example:

- "Implement a C++ function to merge two sorted linked lists."
- "Write C++17 code for Dijkstra's shortest path using a priority queue."
- "In C++, implement an LRU cache with O(1) get/put operations."

Tips:
- Include the language name (e.g., "C++", "cpp") to trigger code mode.
- Mention constraints or edge cases you care about (e.g., memory limits, big-O expectations).
- If you only want a function and not `main()`, add: "Function only, no main." 

Output Includes:
- Brief structured explanation
- Bullet point key considerations
- Fenced code block: ```cpp ... ``` for clean rendering
- Time & Space complexity summary

If you want alternative approaches, include: "Compare 2 approaches before coding".

This starts the Python server on ws://localhost:8765 and launches Electron.
npm run test:comprehensive
```

This will:
1. Start the server automatically if not running
2. Test OCR functionality
3. Test resume parsing
4. Verify LLM connections if API keys are configured

For specific tests, you can run:

```powershell
# Test just OCR functionality
cd python && python comprehensive_test.py --no-auto-start

# Run with custom server location
cd python && python comprehensive_test.py --host localhost --port 8765
```

## Usage
- Start Mic to transcribe in real time.
- Toggle Stealth (Ctrl+Shift+S) to hide/show overlay; app windows are content-protected to avoid screen-share leaks.
- Upload a resume to personalize coaching.
- Capture screen to OCR coding prompts and include them in context.
- Choose an LLM and click Ask for live streamed guidance.

### New: Resume Upload Button
The former Settings gear button on the compact toolbar has been replaced with an Upload Resume icon (document with an arrow). Click it (or press Enter/Space while focused) to select a `.pdf`, `.docx`, `.doc`, or `.txt` file. The file is sent over the existing WebSocket (`type: "resume"`) and parsed on the Python server into semantic chunks for personalized embeddings.

After a successful upload you'll see a small toast notification ("Ingested N resume chunks"). Subsequent interviewer questions automatically retrieve the top relevant resume snippets and incorporate them into AI coaching responses—no extra action required.

If the server is not yet connected when you click the button, you'll get a warning; you can retry once the status indicator shows Connected.

Privacy: The resume stays local—it's embedded in-memory only and cleared when the application is closed.

## Notes
- Audio pipeline sends 16kHz PCM16 chunks for lowest latency. Real-time streaming transcription is handled via Deepgram (requires `DEEPGRAM_API_KEY`) or other configured provider.
- All data is in-memory and cleared on quit. Add persistence if desired.
- For production packaging use: `npm run build`.

## Troubleshooting
- If Tesseract is missing on Windows, install it and ensure it's in PATH or set `pytesseract.pytesseract.tesseract_cmd`.
- If streaming transcription is unreliable, check that `DEEPGRAM_API_KEY` is set, verify network access, and confirm your Deepgram account/plan supports real-time streaming.
- For Groq models, install `groq` SDK and set `GROQ_API_KEY`.

### Windows: Tesseract OCR
- Download installer: https://github.com/UB-Mannheim/tesseract/wiki
- Default path we auto-detect: `C:\\Program Files\\Tesseract-OCR\\tesseract.exe` (or x86 variant).
- If installed elsewhere, set env var `TESSERACT_CMD` or hardcode `pytesseract.pytesseract.tesseract_cmd`.

OCR capture tips:
- We downscale captures to max ~1920px width to fit WebSocket payload limits.
- If `ImageCapture.grabFrame()` fails, the app falls back to drawing the video frame to a canvas.

## Avoiding Truncated AI Answers
If you notice the AI responses ending prematurely or missing endings (e.g. code blocks not closed), adjust these environment variables:

| Variable | Purpose | Default | Notes |
|----------|---------|---------|-------|
| `AI_MAX_TOKENS` or `AI_MAX_NEW_TOKENS` | Upper bound on tokens the model may generate in one pass | 2048 | Set higher (e.g. 4096) for long answers. 0 or negative omits the limit (provider decides). Hard-capped at 32768 for safety. |
| `AI_CONTINUE_PASSES` | Number of automatic continuation passes if an answer seems cut off | 3 | Each pass prompts the model to continue ONLY missing remainder. Set to 0 to disable. |
| `AI_AUTO_CONTINUE` | Master on/off for auto-continue heuristic | 1 (enabled) | Set to `0`/`false` to disable additional passes entirely. |
| `STREAM_CHUNK_MODE` | Streaming granularity (`sentence` or `fast`) | sentence | `fast` flushes each token ASAP (useful to see progress earlier). |
| `AI_PRESERVE_FORMATTING` | Return model output verbatim | 1 (enabled) | Set to `0` to enable legacy cleanup that normalizes spacing and code fences. |
| `OCR_FAST_MODE` | Stop after the first high-confidence OCR pass | 1 (enabled) | Set to `0` to force the full multi-pass pipeline (slower but thorough). |
| `OCR_VARIANT_BUDGET_SECONDS` | Extra time budget for deep OCR refinement | 2.5 | Increase for accuracy, decrease for lower latency. |

Symptoms & Fixes:
- Ends mid-sentence or code fence: Increase `AI_MAX_TOKENS` and keep `AI_AUTO_CONTINUE=1`.
- Repetition in continuations: Lower `AI_CONTINUE_PASSES` to 1–2 or disable with `AI_AUTO_CONTINUE=0`.
- Latency too high before first output: Set `STREAM_CHUNK_MODE=fast`.

Example (PowerShell):
```powershell
$env:AI_MAX_TOKENS=4096
$env:AI_CONTINUE_PASSES=2
$env:STREAM_CHUNK_MODE="fast"
npm run start
```

You can also create a `.env` file with:
```
AI_MAX_TOKENS=4096
AI_CONTINUE_PASSES=2
AI_AUTO_CONTINUE=1
STREAM_CHUNK_MODE=fast
```
Restart the app after changes. Current runtime values are visible via the `ai_status` request.
