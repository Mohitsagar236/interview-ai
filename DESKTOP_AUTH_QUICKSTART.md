# 🚀 Desktop App Authentication - Quick Start

## Setup (5 minutes)

### 1. Run Database Migration

```sql
-- In Supabase SQL Editor, paste and run: api-keys-migration.sql
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

---

## How It Works

### User Experience:

1. **First Launch** → Login dialog appears
2. **Enter credentials** → Email + password (same as website)
3. **Automatic setup** → API key generated & credits synced
4. **Start using** → Interview sessions work automatically

### What Happens Behind the Scenes:

```
User Login
  ↓
Supabase Authentication
  ↓
Generate API Key (ia_...)
  ↓
Store Encrypted Locally
  ↓
Sync Credits from Server
  ↓
Ready to Use!
```

---

## Key Features

✅ **One-Time Login** - Users login once, app remembers them  
✅ **Auto Credit Sync** - Before/after each session  
✅ **Secure** - API keys hashed in database, encrypted locally  
✅ **No Manual Keys** - No need to copy/paste keys from website  
✅ **Session Protection** - Can't start sessions without credits  

---

## Testing

### Test Login:
```
1. Launch app
2. Login with: test@example.com / password123
3. Should see credits in toolbar
```

### Test Session:
```
1. Start interview
2. Credits checked ✅
3. Session runs
4. End session
5. Credits deducted ✅
6. Server updated ✅
```

### Test Logout:
```
1. Logout from app
2. Try to start session
3. Should prompt for login ✅
```

---

## API Endpoints

```
POST   /api/generate-api-key    (Auth: Bearer token)
GET    /api/get-credits         (Auth: X-API-Key)
POST   /api/update-credits      (Auth: X-API-Key)
GET    /api/validate-key        (Auth: X-API-Key)
```

---

## Files Created/Modified

```
✨ NEW FILES:
  api-keys-migration.sql          - Database migration
  api/api-keys.js                 - API key management
  electron/desktop-auth-manager.js - Auth manager class
  electron/login.html             - Login dialog UI
  DESKTOP_AUTH_SYSTEM.md          - Full documentation
  
📝 MODIFIED:
  local-dev-server.js             - Added API routes
  electron/main.js                - Added IPC handlers + auth checks
  package.json                    - Added electron-store dependency
```

---

## Production Deployment

1. **Update API URL** in `electron/desktop-auth-manager.js`:
   ```javascript
   this.apiBaseUrl = 'https://your-domain.com';
   ```

2. **Set Environment Variables** on your hosting platform:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-key
   ```

3. **Build App**:
   ```bash
   npm run build:prod
   ```

---

## Troubleshooting

**Login not working?**
- Check Supabase credentials in `.env`
- Verify local server is running (`npm run dev`)

**Credits not syncing?**
- Check API base URL is correct
- Verify network connectivity
- Check console logs

**Can't start session?**
- Ensure user is logged in
- Verify user has credits (check website)
- Try manual credit sync

---

## Next Steps

- [ ] Run database migration
- [ ] Test login flow
- [ ] Test session with credits
- [ ] Build production version
- [ ] Deploy to users

🎉 **That's it!** Your desktop app now has secure authentication and automatic credit management!
