# Improvement Roadmap

Planned improvements for Interview AI, organized by priority.

## Priority 1: Critical Security

### Remove Bundled Secrets
**Status:** 🔴 Not Started  
**Impact:** Security Critical

Currently, the `.env` file with API keys is bundled in the desktop app. This exposes keys to all users.

**Solution:**
- Use environment variables at runtime
- Proxy API calls through backend
- Per-user API key management

### Add Input Validation
**Status:** 🔴 Not Started  
**Impact:** Security Critical

API endpoints lack proper input validation.

**Solution:**
- Add Joi/Zod schema validation
- Sanitize all user inputs
- Rate limit API endpoints

---

## Priority 2: Code Quality

### Modularize server.py (4,276 lines)
**Status:** 🔴 Not Started  
**Impact:** Maintainability

Split into focused modules:
- `websocket_handler.py` - Connection management
- `ocr_service.py` - OCR processing
- `ai_router.py` - AI model coordination
- `transcription_service.py` - Speech-to-text
- `session_manager.py` - Client sessions

### Modularize main.js (3,353 lines)
**Status:** 🔴 Not Started  
**Impact:** Maintainability

Split into:
- `window-manager.js` - Window lifecycle
- `ipc-handlers.js` - IPC routing
- `server-manager.js` - Python server lifecycle
- `storage.js` - Data persistence

### Add Comprehensive Tests
**Status:** 🔴 Not Started  
**Impact:** Reliability

Current coverage: ~5%  
Target coverage: 80%

Priority test areas:
1. Payment verification logic
2. Credit deduction
3. Activation code validation
4. API endpoints

---

## Priority 3: Performance

### Session State in Redis
**Status:** 🔴 Not Started  
**Impact:** Scalability

Currently, session state is in-memory in `server.py`. This prevents horizontal scaling.

**Solution:**
- Implement Redis session store
- Support multiple server instances

### Async File Operations
**Status:** 🔴 Not Started  
**Impact:** Performance

Replace sync file operations in Electron main process:
```javascript
// Before
fs.writeFileSync(path, data);

// After
await fs.promises.writeFile(path, data);
```

### Connection Pooling
**Status:** 🔴 Not Started  
**Impact:** Performance

Reuse Supabase client instances across serverless function invocations.

---

## Priority 4: Developer Experience

### Consolidate Documentation
**Status:** ✅ In Progress  
**Impact:** Developer Experience

80+ markdown files → Organized `docs/` folder

### Health Check Endpoints
**Status:** 🔴 Not Started  
**Impact:** Operations

Add `/health` endpoint to Python server with:
- Server status
- Database connectivity
- External service status

### CI/CD Improvements
**Status:** 🔴 Not Started  
**Impact:** Operations

Add to GitHub Actions:
- Security scanning (Snyk)
- Full test suite
- Automatic deployment

---

## Priority 5: User Experience

### Accessibility
**Status:** 🔴 Not Started  
**Impact:** Accessibility

- Add ARIA labels
- Keyboard navigation
- Screen reader support

### Offline Support
**Status:** 🔴 Not Started  
**Impact:** UX

- Cache recent responses
- Offline mode indicator
- Queue requests when offline

### Onboarding Flow
**Status:** 🔴 Not Started  
**Impact:** UX

- Welcome tour
- Feature explanations
- Quick-start wizard

---

## Timeline

| Quarter | Focus Area |
|---------|------------|
| Q1 2025 | Security fixes, Input validation |
| Q2 2025 | Modularization, Testing |
| Q3 2025 | Performance, Redis |
| Q4 2025 | UX improvements |
