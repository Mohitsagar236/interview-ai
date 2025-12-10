# System Architecture

Overview of the Interview AI application architecture.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Computer                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Electron Desktop App                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐   │  │
│  │  │   Main      │  │  Renderer   │  │   Preload    │   │  │
│  │  │  Process    │  │  (Toolbar)  │  │   Bridge     │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────────┘   │  │
│  └─────────┼────────────────┼────────────────────────────┘  │
│            │                │                                │
│            │ IPC            │ WebSocket                      │
│            ▼                ▼                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │         Python WebSocket Server (localhost:8765)        ││
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐   ││
│  │  │   OCR   │ │   AI    │ │  STT    │ │   Session   │   ││
│  │  │ Handler │ │ Router  │ │ Handler │ │   Manager   │   ││
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └─────────────┘   ││
│  └───────┼───────────┼───────────┼───────────────────────┘ │
└──────────┼───────────┼───────────┼──────────────────────────┘
           │           │           │
           ▼           ▼           ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ PaddleOCR│ │OpenRouter│ │ Deepgram │
    │  (Local) │ │   API    │ │   API    │
    └──────────┘ └──────────┘ └──────────┘
```

---

## Components

### Electron App (`electron/`)

| File | Purpose |
|------|---------|
| `main.js` | Main process, window management, IPC handlers |
| `preload.js` | Secure bridge between main and renderer |
| `desktop-activation-manager.js` | Activation code management |
| `config.js` | Environment configuration |

### Renderer (`renderer/`)

| File | Purpose |
|------|---------|
| `toolbar.js` | Main UI, chat interface, controls |
| `index.html` | Toolbar HTML structure |

### Python Backend (`python/`)

| File | Purpose |
|------|---------|
| `server.py` | WebSocket server, message routing |
| `ai_router.py` | AI model selection and routing |
| `ocr_handler.py` | Screenshot OCR processing |
| `question_classifier.py` | Question type classification |

### Serverless API (`api/`)

| File | Purpose |
|------|---------|
| `activate-code.js` | Desktop activation |
| `create-razorpay-order.js` | Payment order creation |
| `verify-razorpay-payment.js` | Payment verification |
| `razorpay-webhook.js` | Payment webhooks |

### Frontend (`public/`)

| File | Purpose |
|------|---------|
| `index.html` | Landing page |
| `payment.html` | Payment page |
| `profile.html` | User profile & activation |
| `login.html` | User authentication |

---

## Data Flow

### Interview Session Flow
```
1. User presses hotkey (Alt+C)
2. Electron captures screenshot
3. Screenshot sent to Python server via WebSocket
4. OCR extracts text from screenshot
5. AI generates response
6. Response streamed back to Electron
7. UI displays response in toolbar
```

### Transcription Flow
```
1. User enables microphone
2. Audio streamed to Deepgram
3. Deepgram returns transcription
4. Transcription sent to Python server
5. AI processes and responds
```

### Payment Flow
```
1. User selects plan on payment page
2. Frontend calls /api/create-razorpay-order
3. Razorpay checkout opens
4. User completes payment
5. /api/verify-razorpay-payment validates
6. Credits added to Supabase
7. User generates activation code
```

---

## Database Schema

```
┌─────────────────────┐     ┌─────────────────────┐
│    auth.users       │     │   subscriptions     │
├─────────────────────┤     ├─────────────────────┤
│ id (UUID)           │◄────┤ user_id (UUID)      │
│ email               │     │ plan_type           │
│ created_at          │     │ credits_total       │
└─────────────────────┘     │ credits_used        │
                            │ status              │
                            └─────────────────────┘
                                     │
                                     ▼
                            ┌─────────────────────┐
                            │  activation_codes   │
                            ├─────────────────────┤
                            │ user_id (UUID)      │
                            │ code                │
                            │ credits_total       │
                            │ credits_used        │
                            │ is_active           │
                            └─────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron, Node.js |
| Backend | Python, WebSockets |
| Serverless | Vercel Functions |
| Database | Supabase (PostgreSQL) |
| AI | OpenRouter (GPT-4, Claude, Groq) |
| STT | Deepgram |
| OCR | PaddleOCR |
| Payments | Razorpay |
