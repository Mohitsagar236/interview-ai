# Desktop Activation Testing Guide

## Quick Test Steps

### 1. Run the Backend Server
```powershell
# In your project directory
node local-dev-server.js
```
Server should start on http://localhost:3000

### 2. Test Website (Generate Code)

Open browser and go to:
```
http://localhost:3000/profile.html
```

**Expected:**
- You should see "Desktop App Activation" section
- Activation code displayed (e.g., ABCD-EFGH-IJKL-MNOP)
- Copy button works
- Credits displayed correctly

### 3. Test Desktop App (Use Code)

Run the desktop app:
```powershell
# If in development mode
npm run electron
```

**Expected Flow:**
1. App launches
2. Activation window appears automatically (if not already activated)
3. Enter the activation code from website
4. Click "Activate Desktop App"
5. **Activation window closes**
6. **Toolbar window launches** ← THIS SHOULD HAPPEN NOW!
7. Toolbar shows credits and user info

### 4. Verify Toolbar Launched

**Check:**
- ✅ Small toolbar window appears (floating)
- ✅ Shows your email/name
- ✅ Shows credits remaining
- ✅ Has buttons (Start Interview, Quick Capture, etc.)

### 5. Check Console Logs

Look for these messages in terminal:
```
[Activation] Desktop activated for user: your@email.com
[Activation] Syncing credits from server...
[Credits] ✅ Activation successful with credits
[Activation] Launching toolbar window...
[Activation] ✅ Notified toolbar about credits update
```

## Troubleshooting

### Problem: Toolbar doesn't launch after activation

**Check:**
1. Console logs - any errors?
2. Credits remaining > 0?
3. Backend server running?

**Debug:**
```javascript
// Check in electron console (Help → Toggle Developer Tools)
window.electronAPI.desktopGetActivationStatus()
  .then(status => console.log('Status:', status));

window.electronAPI.desktopGetUser()
  .then(user => console.log('User:', user));
```

### Problem: "Invalid activation code"

**Solutions:**
1. Regenerate code from profile page
2. Copy the FULL code including dashes
3. Make sure backend server is running

### Problem: Activation succeeds but no credits

**Check:**
1. Profile page shows credits > 0?
2. Purchase credits if needed
3. Credits may be used up

## Testing Activation Code Format

Valid codes:
```
ABCD-EFGH-IJKL-MNOP
XXXX-YYYY-ZZZZ-AAAA
1234-5678-9ABC-DEFG
```

Invalid codes:
```
ABCD-EFGH-IJKL       (too short)
abcd-efgh-ijkl-mnop  (will auto-convert to uppercase)
ABCDABCDABCDABCD     (missing dashes - will auto-add)
```

## API Endpoints Test

### Test Generate Code (requires login)
```bash
# Get session token from browser DevTools → Application → Local Storage
curl -X POST http://localhost:3000/api/generate-activation-code \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"regenerate": false}'
```

### Test Activate Desktop
```bash
curl -X POST http://localhost:3000/api/activate-desktop \
  -H "Content-Type: application/json" \
  -d '{"code": "ABCD-EFGH-IJKL-MNOP"}'
```

### Test Get Credits
```bash
curl -X GET http://localhost:3000/api/get-credits-by-code \
  -H "X-Activation-Code: ABCD-EFGH-IJKL-MNOP"
```

## Success Indicators

✅ **Everything Working:**
- Code generates on website
- Code activates desktop app
- Activation window closes
- Toolbar launches automatically
- Credits sync and display
- Can start interviews

❌ **Something Wrong:**
- Activation fails
- Toolbar doesn't appear
- Credits show 0 (but you have credits)
- Console errors

## Common Issues & Fixes

### Issue: "Activation manager not initialized"
**Fix:** Restart desktop app

### Issue: Toolbar appears but no credits
**Fix:** Click refresh button in toolbar, or regenerate activation code

### Issue: Old login window appears
**Fix:** Clear app data:
- Windows: `%APPDATA%\interview-ai-desktop`
- Delete the folder and restart app

### Issue: Database migration needed
**Fix:** Run `COMPLETE_DATABASE_MIGRATION.sql` in Supabase

## Full Reset (if needed)

1. **Clear Desktop App Data:**
   ```powershell
   Remove-Item -Recurse -Force "$env:APPDATA\interview-ai-desktop"
   Remove-Item -Recurse -Force "$env:APPDATA\activation-secure.json"
   ```

2. **Regenerate Activation Code:**
   - Go to profile page
   - Click "Deactivate"
   - Click "Generate"

3. **Restart Everything:**
   - Close desktop app
   - Restart backend server
   - Open desktop app
   - Enter new code

## Verification Checklist

Before considering it working:
- [ ] Backend server starts without errors
- [ ] Profile page loads and shows activation section
- [ ] Can generate activation code
- [ ] Can copy code to clipboard
- [ ] Desktop app shows activation window on first launch
- [ ] Can enter activation code (auto-formats)
- [ ] Activation succeeds with success message
- [ ] Activation window closes
- [ ] **Toolbar window launches automatically** ✨
- [ ] Toolbar shows correct user info
- [ ] Toolbar shows correct credits
- [ ] Can start interview from toolbar

---

**Status:** All fixes applied! Toolbar should now launch automatically after activation. ✅
