# 🔧 Desktop App Authentication - Troubleshooting Guide

## Quick Diagnostics

Run these checks first:

```bash
# 1. Check if local server is running
curl http://localhost:3000/api/validate-key
# Should return: {"error":"API key required"}

# 2. Check database migration
# In Supabase SQL Editor:
SELECT COUNT(*) FROM api_keys;
# Should not error

# 3. Check environment variables
# In terminal:
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY
# Should show values
```

---

## Common Issues & Solutions

### ❌ Issue: Login Dialog Doesn't Appear

**Symptoms:**
- App launches but no login dialog
- Can't authenticate
- No credits showing

**Diagnosis:**
```javascript
// Check in Electron console
console.log('[Auth] Auth manager initialized:', !!authManager);
console.log('[Auth] Is authenticated:', authManager?.isAuthenticated());
```

**Solutions:**

1. **Auth manager not initialized:**
   ```javascript
   // In electron/main.js, check this exists:
   authManager = new DesktopAuthManager();
   ```

2. **Already authenticated (from previous session):**
   ```javascript
   // Force logout and re-login:
   await window.electronAPI.invoke('desktop-logout');
   await window.electronAPI.invoke('desktop-open-login');
   ```

3. **Login window blocked:**
   - Check for popup blockers
   - Try: `electron/main.js` → verify `loginWindow` creation

---

### ❌ Issue: Login Fails with Valid Credentials

**Symptoms:**
- Enter correct email/password
- Get error: "Authentication failed" or "Login failed"

**Diagnosis:**
```bash
# 1. Check Supabase credentials in login.html
grep SUPABASE_URL electron/login.html
grep SUPABASE_ANON_KEY electron/login.html

# 2. Test Supabase auth directly
curl -X POST https://your-project.supabase.co/auth/v1/token \
  -H "apikey: your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","grant_type":"password"}'
```

**Solutions:**

1. **Wrong Supabase credentials:**
   ```html
   <!-- Update in electron/login.html -->
   const SUPABASE_URL = 'https://your-correct-url.supabase.co';
   const SUPABASE_ANON_KEY = 'your-correct-anon-key';
   ```

2. **User doesn't exist:**
   - Create account on website first
   - Then login in desktop app

3. **Network issue:**
   - Check internet connection
   - Try: ping https://your-project.supabase.co

---

### ❌ Issue: API Key Generation Fails

**Symptoms:**
- Login succeeds but error: "Failed to get API key"
- No API key stored

**Diagnosis:**
```bash
# Check API endpoint
curl -X POST http://localhost:3000/api/generate-api-key \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{"regenerate":false}'
```

**Solutions:**

1. **Local server not running:**
   ```bash
   # Start server
   npm run dev
   # Check if running on port 3000
   ```

2. **Database table missing:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT * FROM api_keys LIMIT 1;
   -- If error, run: api-keys-migration.sql
   ```

3. **Wrong API base URL:**
   ```javascript
   // In electron/desktop-auth-manager.js
   this.apiBaseUrl = 'http://localhost:3000'; // Check this
   ```

---

### ❌ Issue: Credits Show 0 But User Has Credits

**Symptoms:**
- Login successful
- Toolbar shows "0 hours" or "No credits"
- User purchased credits on website

**Diagnosis:**
```bash
# 1. Check credits in database
# In Supabase:
SELECT * FROM subscriptions WHERE user_id = 'your-user-id';

# 2. Test API endpoint
curl http://localhost:3000/api/get-credits \
  -H "X-API-Key: ia_your-key-here"
```

**Solutions:**

1. **Credits not syncing:**
   ```javascript
   // In desktop app, manually trigger sync:
   const result = await window.electronAPI.invoke('desktop-sync-credits');
   console.log('Credits:', result.credits);
   ```

2. **Wrong user_id:**
   - Check that logged-in user matches purchased account
   - Logout and login again

3. **API endpoint issue:**
   - Check `local-dev-server.js` has `/api/get-credits` route
   - Verify no errors in server console

---

### ❌ Issue: Can't Start Interview Session

**Symptoms:**
- Click "Start Interview"
- Get error: "Please login" or "No credits remaining"
- Or session doesn't start at all

**Diagnosis:**
```javascript
// Check authentication
const { authenticated } = await window.electronAPI.invoke('desktop-is-authenticated');
console.log('Authenticated:', authenticated);

// Check credits
const { ok, credits } = await window.electronAPI.invoke('credits-load');
console.log('Credits:', credits);

// Try starting session
const result = await window.electronAPI.invoke('interview-start-session', 'test-id');
console.log('Session start result:', result);
```

**Solutions:**

1. **Not authenticated:**
   ```javascript
   // Open login
   await window.electronAPI.invoke('desktop-open-login');
   ```

2. **No credits:**
   - Buy credits on website
   - Wait for sync (or trigger manually)
   - Retry session start

3. **Session already active:**
   - End current session first
   - Then start new session

4. **Interview not found:**
   - Check interview ID exists
   - Create new interview first

---

### ❌ Issue: Credits Don't Deduct After Session

**Symptoms:**
- Session ends normally
- Credits not deducted locally or on server
- Toolbar still shows old balance

**Diagnosis:**
```javascript
// Check credits manager
const info = await window.electronAPI.invoke('credits-load');
console.log('Credits info:', info);

// Check active session
const session = await window.electronAPI.invoke('credits-get-active-session');
console.log('Active session:', session);
```

**Solutions:**

1. **Credits manager not initialized:**
   ```javascript
   // In electron/main.js, check:
   creditsManager = new CreditsManager(dataDir);
   ```

2. **Session not ended properly:**
   ```javascript
   // Force end session
   await window.electronAPI.invoke('credits-end-session', sessionId, durationSeconds);
   ```

3. **Server sync failed:**
   - Check network connection
   - Check console logs for sync errors
   - Retry: `desktop-sync-credits`

---

### ❌ Issue: API Key Invalid After Working Before

**Symptoms:**
- Was working fine
- Suddenly: "Invalid API key" errors
- Can't sync credits

**Diagnosis:**
```bash
# Test key validation
curl http://localhost:3000/api/validate-key \
  -H "X-API-Key: ia_your-key-here"
```

**Solutions:**

1. **Key was regenerated/deleted:**
   ```javascript
   // Logout and re-login
   await window.electronAPI.invoke('desktop-logout');
   await window.electronAPI.invoke('desktop-open-login');
   ```

2. **Key expired:**
   - If expiration was set, generate new key
   - Login again to get fresh key

3. **Database issue:**
   ```sql
   -- Check key in database
   SELECT * FROM api_keys WHERE is_active = true LIMIT 10;
   ```

---

### ❌ Issue: Login Window Opens But Can't Type

**Symptoms:**
- Login dialog appears
- Can't click or type in fields
- Window seems frozen

**Solutions:**

1. **Focus issue:**
   - Click in the window
   - Try Alt+Tab to refocus
   - Close and reopen: `desktop-open-login`

2. **DevTools blocking:**
   - Close any open DevTools
   - Restart app

3. **Renderer crash:**
   - Check Electron console for errors
   - Restart app

---

### ❌ Issue: Server Returns 500 Error

**Symptoms:**
- API calls fail with 500 error
- Server logs show errors
- Can't sync credits or validate key

**Diagnosis:**
```bash
# Check server logs
# Look for errors in terminal where you ran `npm run dev`

# Test server health
curl http://localhost:3000/
```

**Solutions:**

1. **Missing environment variables:**
   ```bash
   # Check .env file has:
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   SUPABASE_ANON_KEY=...
   ```

2. **Supabase connection issue:**
   - Verify credentials are correct
   - Test connection manually
   - Check Supabase dashboard for outages

3. **Database query error:**
   - Check migrations ran successfully
   - Verify table structure matches code

---

## Advanced Debugging

### Enable Verbose Logging

```javascript
// In electron/desktop-auth-manager.js
// Add at top of each method:
console.log('[Auth] Method called:', methodName, arguments);

// In electron/main.js
// Check all IPC logs:
ipcMain.handle('desktop-login', async (_event, credentials) => {
  console.log('[IPC] desktop-login called:', credentials.email);
  // ... rest of code
});
```

### Test API Endpoints Manually

```bash
# 1. Generate test token
# Login to website, open DevTools Console:
const session = await supabase.auth.getSession();
console.log(session.data.session.access_token);

# 2. Test generate-api-key
curl -X POST http://localhost:3000/api/generate-api-key \
  -H "Authorization: Bearer <token-from-step-1>" \
  -H "Content-Type: application/json" \
  -d '{"regenerate":false}'

# 3. Test get-credits (use apiKey from step 2)
curl http://localhost:3000/api/get-credits \
  -H "X-API-Key: ia_..."

# 4. Test update-credits
curl -X POST http://localhost:3000/api/update-credits \
  -H "X-API-Key: ia_..." \
  -H "Content-Type: application/json" \
  -d '{"creditsUsed":1.5}'
```

### Check Electron Store

```javascript
// In desktop app console or renderer DevTools:
const result = await window.electronAPI.invoke('desktop-get-user');
console.log('Stored user data:', result.user);
```

### Reset Everything

```javascript
// Nuclear option - clear all data
await window.electronAPI.invoke('desktop-logout');
// Then manually delete:
// Windows: %APPDATA%/interview-ai-assistant/auth-secure.json
// macOS: ~/Library/Application Support/interview-ai-assistant/auth-secure.json
// Linux: ~/.config/interview-ai-assistant/auth-secure.json
```

---

## Performance Issues

### Slow Credit Sync

**Symptoms:**
- Credit sync takes > 5 seconds
- App feels sluggish

**Solutions:**

1. **Network latency:**
   - Check internet speed
   - Try different network

2. **Server overload:**
   - Check server CPU/memory
   - Optimize database queries

3. **Too many API calls:**
   - Implement caching
   - Reduce sync frequency

---

## Security Concerns

### Exposed API Key

**If API key is accidentally exposed:**

1. **Immediately regenerate:**
   ```javascript
   // Call from website or API directly
   POST /api/generate-api-key
   { "regenerate": true }
   ```

2. **Check for unauthorized usage:**
   ```sql
   SELECT * FROM api_keys 
   WHERE user_id = 'your-user-id'
   ORDER BY last_used_at DESC;
   ```

3. **Revoke old key:**
   ```sql
   UPDATE api_keys 
   SET is_active = false 
   WHERE key_hash = 'old-key-hash';
   ```

---

## Getting Help

### Information to Provide

When reporting issues, include:

```
1. Error message (exact text)
2. When error occurs (login, sync, session, etc.)
3. Electron console logs
4. Server console logs (if applicable)
5. Browser DevTools logs (if applicable)
6. Environment:
   - OS: Windows/Mac/Linux
   - Node version: node --version
   - Electron version: from package.json
   - Desktop app version
7. Steps to reproduce
8. What was expected vs what happened
```

### Useful Commands

```bash
# Check versions
node --version
npm --version
electron --version

# Check running processes
# Windows:
netstat -ano | findstr :3000

# Mac/Linux:
lsof -i :3000

# Check logs
# Electron logs are in console where you ran npm start

# Check database
# Use Supabase SQL Editor to query tables
```

---

## Still Having Issues?

1. **Check documentation:**
   - `DESKTOP_AUTH_SYSTEM.md` - Complete reference
   - `DESKTOP_AUTH_QUICKSTART.md` - Setup guide
   - `DESKTOP_AUTH_VISUAL_GUIDE.md` - Diagrams

2. **Review code:**
   - `electron/desktop-auth-manager.js` - Auth logic
   - `api/api-keys.js` - API endpoints
   - `electron/main.js` - IPC handlers

3. **Test environment:**
   - Run `npm run dev` and check for errors
   - Test API endpoints manually
   - Verify database migrations

4. **Start fresh:**
   - Logout and clear storage
   - Restart app
   - Login again

Good luck! 🍀
