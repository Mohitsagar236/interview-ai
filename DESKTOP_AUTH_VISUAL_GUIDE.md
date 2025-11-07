# 🔐 Desktop App Authentication System - Visual Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERVIEW AI ECOSYSTEM                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐
│   Web Browser    │         │   Desktop App    │
│                  │         │    (Electron)    │
│  • Sign Up       │         │                  │
│  • Purchase      │         │  • Login Once    │
│  • Profile       │         │  • Auto Sync     │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         │ Supabase Auth              │ Supabase Auth
         │                            │ + API Key
         ▼                            ▼
┌─────────────────────────────────────────────────┐
│             SUPABASE (Backend)                  │
│                                                 │
│  ┌─────────────┐  ┌──────────────┐            │
│  │ auth.users  │  │ subscriptions│            │
│  │             │  │              │            │
│  │ • id        │  │ • credits_   │            │
│  │ • email     │  │   total      │            │
│  │ • password  │  │ • credits_   │            │
│  └──────┬──────┘  │   used       │            │
│         │         └──────────────┘            │
│         │                                      │
│         │         ┌──────────────┐            │
│         └────────►│  api_keys    │            │
│                   │              │            │
│                   │ • user_id    │            │
│                   │ • key_hash   │            │
│                   │ • is_active  │            │
│                   └──────────────┘            │
└─────────────────────────────────────────────────┘
                     ▲
                     │ API Calls
                     │ (X-API-Key header)
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼────┐           ┌─────▼─────┐
    │ Credits │           │ Sessions  │
    │  Sync   │           │ Tracking  │
    └─────────┘           └───────────┘
```

---

## Authentication Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    FIRST TIME USER                           │
└──────────────────────────────────────────────────────────────┘

1. User launches desktop app
   │
   ▼
2. Login dialog appears
   ┌──────────────────────────┐
   │  📧 Email: user@mail.com │
   │  🔒 Password: ********   │
   │  [     Sign In      ]    │
   └──────────────────────────┘
   │
   ▼
3. Authenticate with Supabase
   POST /auth/v1/token
   {
     "email": "user@mail.com",
     "password": "********"
   }
   │
   ▼
4. Receive access token
   {
     "access_token": "eyJhbGc...",
     "user": { "id": "...", ... }
   }
   │
   ▼
5. Generate API key
   POST /api/generate-api-key
   Authorization: Bearer eyJhbGc...
   │
   ▼
6. Store API key (encrypted)
   Electron Store: {
     "userId": "...",
     "email": "user@mail.com",
     "apiKey": "ia_abc123..." ← ENCRYPTED
   }
   │
   ▼
7. Sync credits from server
   GET /api/get-credits
   X-API-Key: ia_abc123...
   │
   ▼
8. Ready to use! ✅
   Credits: 15 hours
```

---

## Session Flow

```
┌──────────────────────────────────────────────────────────────┐
│                   INTERVIEW SESSION                          │
└──────────────────────────────────────────────────────────────┘

User clicks "Start Interview"
│
├─► Check: Is authenticated?
│   └─► NO  → Show login dialog → Continue
│   └─► YES → Continue
│
├─► Sync credits from server
│   GET /api/get-credits
│   X-API-Key: ia_abc123...
│   │
│   ▼
│   Response: {
│     "total": 15,
│     "used": 3,
│     "remaining": 12 ← UPDATE LOCAL
│   }
│
├─► Check: Has credits?
│   └─► NO  → ❌ Show error: "Purchase more credits"
│   └─► YES → ✅ Continue
│
├─► Start interview session
│   Timer starts: 00:00
│   Credits manager tracking...
│
├─► Interview in progress...
│   00:05... 00:10... 00:15...
│   Real-time tracking active
│
├─► User ends session
│   Total time: 42 minutes = 0.7 credits
│
├─► Calculate & deduct locally
│   Credits used: 3 + 0.7 = 3.7
│   Remaining: 15 - 3.7 = 11.3
│
├─► Update server
│   POST /api/update-credits
│   X-API-Key: ia_abc123...
│   Body: { "creditsUsed": 3.7 }
│
└─► Update toolbar display
    Credits: 11.3 hours ✅
```

---

## Credit Synchronization

```
┌──────────────────────────────────────────────────────────────┐
│              CREDIT SYNC MECHANISM                           │
└──────────────────────────────────────────────────────────────┘

LOCAL STORAGE          SERVER (Supabase)
(Desktop App)          (subscriptions table)

┌──────────┐           ┌──────────┐
│ credits  │           │ credits_ │
│ {        │◄─────────►│ total: 15│
│  total:  │   SYNC    │ credits_ │
│  15      │           │ used: 3  │
│  used: 3 │           └──────────┘
│  remain: │
│  12      │
└──────────┘

SYNC TRIGGERS:
1. App launch
2. Before session start
3. After session end
4. Manual refresh (optional)

SYNC PROCESS:
Desktop App              Server
    │                      │
    ├──GET /api/get-credits►
    │  X-API-Key: ia_...   │
    │                      │
    │◄──────{credits}──────┤
    │   total, used, etc   │
    │                      │
    └──UPDATE LOCAL STORE  │
        ✅ Synced!
```

---

## Security Layers

```
┌──────────────────────────────────────────────────────────────┐
│                   SECURITY ARCHITECTURE                      │
└──────────────────────────────────────────────────────────────┘

Layer 1: USER AUTHENTICATION
────────────────────────────
Email + Password → Supabase Auth
- Secure password hashing
- JWT tokens
- Session management

Layer 2: API KEY GENERATION
────────────────────────────
Supabase Token → API Key Generator
- Random 32-byte key: ia_abc123...
- SHA-256 hash stored in DB
- Original key shown ONCE only

Layer 3: LOCAL STORAGE
────────────────────────────
API Key → Electron Store
- AES encryption
- Local machine only
- Protected by OS permissions

Layer 4: API VALIDATION
────────────────────────────
Request → Middleware → Database
- Hash incoming key
- Lookup in api_keys table
- Verify user_id and is_active
- Check expiration (if set)

Layer 5: DATABASE SECURITY
────────────────────────────
Supabase → Row Level Security
- Users can only access own data
- Service role for validation
- Encrypted connections (HTTPS)
```

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│              COMPLETE DATA FLOW                              │
└──────────────────────────────────────────────────────────────┘

┌─────────────┐
│  DESKTOP    │
│     APP     │
└──────┬──────┘
       │
       │ 1. Login (email/password)
       │
       ▼
┌─────────────┐
│  SUPABASE   │
│    AUTH     │
└──────┬──────┘
       │
       │ 2. Access Token
       │
       ▼
┌─────────────┐
│ API KEY GEN │
│  /api/      │
│  generate-  │
│  api-key    │
└──────┬──────┘
       │
       │ 3. API Key: ia_abc123...
       │
       ▼
┌─────────────┐
│  ENCRYPTED  │
│   STORAGE   │
│  (electron- │
│    store)   │
└──────┬──────┘
       │
       │ 4. Stored securely
       │
       ├─────────────────────────────┐
       │                             │
       ▼                             ▼
┌─────────────┐              ┌─────────────┐
│GET CREDITS  │              │UPDATE       │
│  /api/      │              │CREDITS      │
│  get-       │              │  /api/      │
│  credits    │              │  update-    │
│             │              │  credits    │
└──────┬──────┘              └──────┬──────┘
       │                             │
       │ X-API-Key: ia_abc123...     │
       │                             │
       ▼                             ▼
┌─────────────────────────────────────────┐
│         SUPABASE DATABASE               │
│                                         │
│  ┌────────┐         ┌────────┐        │
│  │api_keys│────────►│subscrip│        │
│  │        │ validate│tions   │        │
│  │key_hash│         │credits │        │
│  └────────┘         └────────┘        │
│                                         │
└─────────────────────────────────────────┘
       │
       │ 5. Credits data
       │
       ▼
┌─────────────┐
│   DESKTOP   │
│     APP     │
│   TOOLBAR   │
│ Credits: 12 │
└─────────────┘
```

---

## Error Handling Flow

```
┌──────────────────────────────────────────────────────────────┐
│                   ERROR SCENARIOS                            │
└──────────────────────────────────────────────────────────────┘

Scenario 1: NOT AUTHENTICATED
────────────────────────────
Start Session Attempt
  │
  ├─► Check auth
  │   └─► NOT authenticated
  │
  └─► ❌ Error: "Please login to use the desktop app"
      └─► Show login dialog
          └─► After login → Retry session start

Scenario 2: NO CREDITS
────────────────────────────
Start Session Attempt
  │
  ├─► Check credits
  │   └─► 0 credits remaining
  │
  └─► ❌ Error: "No credits remaining"
      └─► Show: "Purchase more credits"
          └─► Button: "Buy Credits"
              └─► Opens website in browser

Scenario 3: INVALID API KEY
────────────────────────────
API Call
  │
  ├─► Validate key
  │   └─► Key not found or inactive
  │
  └─► ❌ Error: 401 Unauthorized
      └─► Clear local storage
          └─► Show login dialog
              └─► User re-authenticates

Scenario 4: NETWORK ERROR
────────────────────────────
Credit Sync Attempt
  │
  ├─► GET /api/get-credits
  │   └─► Network timeout
  │
  └─► ⚠️ Warning: "Using cached credits"
      └─► Continue with local data
          └─► Retry sync on next session
```

---

## Deployment Checklist

```
┌──────────────────────────────────────────────────────────────┐
│              DEPLOYMENT STEPS                                │
└──────────────────────────────────────────────────────────────┘

□ STEP 1: DATABASE SETUP
  │
  ├─ [ ] Run api-keys-migration.sql in Supabase
  ├─ [ ] Verify api_keys table created
  ├─ [ ] Check indexes created
  └─ [ ] Test RLS policies

□ STEP 2: BACKEND CONFIGURATION
  │
  ├─ [ ] Set SUPABASE_URL in .env
  ├─ [ ] Set SUPABASE_SERVICE_KEY in .env
  ├─ [ ] Set SUPABASE_ANON_KEY in .env
  └─ [ ] Start local dev server (npm run dev)

□ STEP 3: TEST API ENDPOINTS
  │
  ├─ [ ] Test POST /api/generate-api-key
  ├─ [ ] Test GET /api/get-credits
  ├─ [ ] Test POST /api/update-credits
  └─ [ ] Test GET /api/validate-key

□ STEP 4: DESKTOP APP CONFIGURATION
  │
  ├─ [ ] Update API base URL (if production)
  ├─ [ ] Install dependencies (npm install)
  ├─ [ ] Test login dialog
  └─ [ ] Test credit sync

□ STEP 5: INTEGRATION TESTING
  │
  ├─ [ ] Login flow works
  ├─ [ ] API key generated
  ├─ [ ] Credits sync correctly
  ├─ [ ] Session requires auth
  ├─ [ ] Session checks credits
  ├─ [ ] Credits deducted properly
  └─ [ ] Server updated after session

□ STEP 6: BUILD & DEPLOY
  │
  ├─ [ ] Build desktop app (npm run build:prod)
  ├─ [ ] Test built app
  ├─ [ ] Deploy API to production
  └─ [ ] Distribute app to users

□ STEP 7: POST-DEPLOYMENT
  │
  ├─ [ ] Monitor API logs
  ├─ [ ] Track API key generation
  ├─ [ ] Monitor credit sync errors
  └─ [ ] Gather user feedback
```

---

## Quick Reference Commands

```bash
# Setup
npm install                    # Install dependencies
npm run dev                    # Start development server

# Testing
# Login: test@example.com / password123
# Check credits in toolbar after login

# Production
npm run build:prod            # Build desktop app

# Database
# Run in Supabase SQL Editor:
# api-keys-migration.sql

# Logs
# Check Electron console for auth logs
# Check browser DevTools for API responses
```

---

## Success Indicators

```
✅ WORKING CORRECTLY IF:

1. Login dialog appears on first launch
2. Login succeeds with valid credentials
3. API key automatically generated
4. Credits appear in toolbar (e.g., "12 hours")
5. Can start interview session
6. Session checks authentication first
7. Session checks credits before starting
8. Credits deducted after session ends
9. Toolbar updates with new balance
10. Server receives credit update

❌ ISSUES IF:

1. Login dialog doesn't appear
   → Check auth manager initialization
2. Login fails with valid credentials
   → Check Supabase URL and keys
3. Credits show "0" but user has credits
   → Check API base URL
4. Session starts without authentication
   → Check session start handler
5. Credits don't deduct after session
   → Check credits manager
6. Server doesn't receive updates
   → Check API endpoint and network
```

This visual guide provides a complete overview of the authentication system architecture! 🚀
