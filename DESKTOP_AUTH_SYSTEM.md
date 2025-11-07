# 🔐 Desktop App Authentication & Credit System

## Overview

This system implements secure authentication for the Interview AI desktop application using API keys. Users authenticate once with their web account credentials, and the app receives a secure API key for all future credit synchronization operations.

## 🎯 Key Benefits

✅ **No Manual Key Generation** - Users just login with their email/password  
✅ **Automatic Credit Sync** - Credits automatically sync before and after each session  
✅ **Secure Storage** - API keys are encrypted and stored locally  
✅ **Session Validation** - Every interview session checks for valid credits  
✅ **Seamless UX** - One-time login, then automatic operation  

---

## 📋 Setup Instructions

### Step 1: Database Migration

Run this SQL in your Supabase SQL Editor:

```bash
# Copy the contents of api-keys-migration.sql and run it in Supabase
```

This creates the `api_keys` table with proper security policies.

### Step 2: Install Dependencies

```bash
npm install
```

This installs `electron-store` for secure local storage.

### Step 3: Configure Environment

Ensure your `.env` file has:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

### Step 4: Start Development Server

```bash
npm run dev
```

---

## 🔄 How It Works

### First Time User Flow

1. **User Downloads Desktop App**
   - Installs and launches the application
   
2. **Login Prompt Appears**
   - User enters their email and password (same as web account)
   - App authenticates with Supabase
   
3. **API Key Generation**
   - System automatically generates a unique API key
   - Key is tied to the user's account in database
   - Key is securely stored in encrypted local storage
   
4. **Credit Synchronization**
   - App fetches user's credit balance from server
   - Credits displayed in toolbar
   
5. **Ready to Use**
   - User can now start interview sessions
   - Credits automatically checked and deducted

### Session Flow

```
User clicks "Start Interview"
    ↓
App checks: Is user authenticated?
    ↓ (No)
Show login dialog → Get API key → Continue
    ↓ (Yes)
App syncs credits from server using API key
    ↓
Check: User has credits?
    ↓ (No)
Show error: "Purchase more credits"
    ↓ (Yes)
Start interview session
    ↓
Interview in progress...
    ↓
User ends session
    ↓
Calculate credits used (time-based)
    ↓
Update local credits
    ↓
Sync credits to server using API key
    ↓
Done ✅
```

---

## 🛡️ Security Features

### API Key Security

- **Hashed Storage**: Keys are SHA-256 hashed in database
- **Encrypted Local Storage**: Keys encrypted on user's machine
- **No Hardcoding**: No keys embedded in app code
- **Automatic Expiration**: Optional key expiration support
- **One Active Key**: Only one active key per user at a time

### Authentication Flow

```
Desktop App
    ↓ (email + password)
Supabase Auth
    ↓ (access token)
API Key Generator
    ↓ (API key - shown once)
Encrypted Storage
    ↓ (used for all API calls)
Protected Endpoints
```

---

## 🔌 API Endpoints

### 1. Generate API Key
**POST** `/api/generate-api-key`

**Headers:**
```json
{
  "Authorization": "Bearer <supabase_access_token>",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "regenerate": false
}
```

**Response:**
```json
{
  "success": true,
  "apiKey": "ia_abc123...",
  "keyPrefix": "ia_abc12345...",
  "createdAt": "2025-11-06T10:30:00Z",
  "warning": "Store this key securely. It will not be shown again."
}
```

### 2. Get Credits
**GET** `/api/get-credits`

**Headers:**
```json
{
  "X-API-Key": "ia_abc123..."
}
```

**Response:**
```json
{
  "success": true,
  "credits": {
    "total": 15,
    "used": 3,
    "remaining": 12,
    "planType": "advanced",
    "status": "active"
  }
}
```

### 3. Update Credits
**POST** `/api/update-credits`

**Headers:**
```json
{
  "X-API-Key": "ia_abc123...",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "creditsUsed": 3.5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Credits updated successfully",
  "credits": {
    "total": 15,
    "used": 3.5,
    "remaining": 11.5
  }
}
```

### 4. Validate API Key
**GET** `/api/validate-key`

**Headers:**
```json
{
  "X-API-Key": "ia_abc123..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "API key is valid",
  "userId": "user-uuid-here"
}
```

---

## 💻 Desktop App Usage

### IPC Handlers (Electron Main Process)

```javascript
// Check if user is authenticated
const { authenticated } = await window.electronAPI.invoke('desktop-is-authenticated');

// Get user data
const { ok, user } = await window.electronAPI.invoke('desktop-get-user');
// user: { userId, email, name, apiKey }

// Open login window
await window.electronAPI.invoke('desktop-open-login');

// Login (usually called from login window)
const result = await window.electronAPI.invoke('desktop-login', {
  email: 'user@example.com',
  password: 'password123',
  supabaseUrl: 'https://...',
  supabaseAnonKey: '...'
});

// Logout
await window.electronAPI.invoke('desktop-logout');

// Sync credits from server
const { ok, credits } = await window.electronAPI.invoke('desktop-sync-credits');
```

### Authentication Manager (Node.js)

```javascript
const DesktopAuthManager = require('./electron/desktop-auth-manager');
const authManager = new DesktopAuthManager();

// Check authentication
const isAuth = authManager.isAuthenticated();

// Login
const result = await authManager.login(email, password, supabaseUrl, supabaseAnonKey);

// Get credits
const creditsResult = await authManager.getCredits();

// Update credits
await authManager.updateCredits(3.5);

// Logout
authManager.logout();
```

---

## 🧪 Testing

### Test 1: First Time Login

1. Launch desktop app
2. Should show login dialog automatically
3. Enter valid credentials
4. App should:
   - Generate API key
   - Store it securely
   - Sync credits
   - Show credits in toolbar

### Test 2: Returning User

1. Close and reopen app
2. Should NOT show login dialog
3. Should automatically:
   - Load stored API key
   - Sync credits from server
   - Show updated credits

### Test 3: Session with Credits

1. Ensure user has credits (buy on website if needed)
2. Start an interview session
3. App should:
   - Check authentication ✅
   - Sync latest credits ✅
   - Verify credits available ✅
   - Start session ✅
4. End session
5. App should:
   - Calculate credits used
   - Update local credits
   - Sync to server
   - Update toolbar display

### Test 4: Session without Credits

1. Ensure user has 0 credits
2. Try to start interview session
3. Should show error: "No credits remaining. Please purchase more credits."
4. Provide link to purchase page

### Test 5: Logout

1. Logout from desktop app
2. Try to start session
3. Should prompt for login
4. After re-login, credits should sync

---

## 🎨 UI Components

### Login Dialog (`electron/login.html`)

- Clean, modern design
- Email + password fields
- Loading states
- Error messages
- Link to signup page

### Profile Page Integration (TODO)

Add to `public/profile.html`:

```html
<div class="api-key-section">
  <h3>Desktop App API Key</h3>
  <div class="api-key-display">
    <code id="api-key-prefix">ia_12345***</code>
    <button id="regenerate-key-btn">Regenerate Key</button>
  </div>
  <p class="help-text">
    Use this key to authenticate your desktop app.
    Keep it secure - it's like a password!
  </p>
</div>
```

---

## 🚀 Production Deployment

### 1. Update API Base URL

Edit `electron/desktop-auth-manager.js`:

```javascript
this.apiBaseUrl = 'https://your-production-domain.com'; // Update this
```

### 2. Environment Variables

Set in your hosting platform (Vercel/Railway/etc):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### 3. Build Desktop App

```bash
npm run build:prod
```

### 4. Test Production Build

- Install built app
- Test login
- Test credit sync
- Test sessions

---

## 📊 Database Schema

### `api_keys` Table

```sql
id              UUID PRIMARY KEY
user_id         UUID → auth.users(id)
key_hash        TEXT UNIQUE (SHA-256 hash)
key_prefix      TEXT (first 12 chars for display)
name            TEXT ('Desktop App Key')
last_used_at    TIMESTAMP
created_at      TIMESTAMP
expires_at      TIMESTAMP (NULL = never expires)
is_active       BOOLEAN
```

**Indexes:**
- `idx_api_keys_user_id` on `user_id`
- `idx_api_keys_key_hash` on `key_hash`
- `idx_api_keys_active` on `is_active` WHERE `is_active = true`

**RLS Policies:**
- Users can view their own keys
- Users can create their own keys
- Users can update their own keys
- Users can delete their own keys
- Service role has full access (for validation)

---

## 🐛 Troubleshooting

### Issue: "Not authenticated" error when starting session

**Solution:**
1. Check if user is logged in: `desktop-is-authenticated`
2. If not, trigger login: `desktop-open-login`
3. Verify API key exists in encrypted storage

### Issue: Credits not syncing

**Solution:**
1. Check API base URL in `desktop-auth-manager.js`
2. Verify local dev server is running (`npm run dev`)
3. Check network connectivity
4. Verify API key is valid: `/api/validate-key`

### Issue: Login fails with "Authentication failed"

**Solution:**
1. Verify Supabase credentials are correct
2. Check user exists in Supabase (try web login)
3. Ensure Supabase URL and keys are correct
4. Check console logs for detailed error

### Issue: API key not found in database

**Solution:**
1. Run `api-keys-migration.sql` in Supabase
2. Verify table was created: Check Supabase dashboard
3. Try regenerating key from profile page (once implemented)

---

## 📈 Future Enhancements

- [ ] Implement key rotation (auto-regenerate every 90 days)
- [ ] Add key revocation API
- [ ] Support multiple active keys per user
- [ ] Add key usage analytics
- [ ] Implement rate limiting per API key
- [ ] Add key permissions/scopes
- [ ] Support key sharing (for team accounts)

---

## ✅ Success Checklist

- [ ] Database migration completed
- [ ] Dependencies installed (`electron-store`)
- [ ] Environment variables configured
- [ ] Local server running
- [ ] Desktop app login working
- [ ] API key generation working
- [ ] Credits sync working
- [ ] Sessions require authentication
- [ ] Credits deducted after sessions
- [ ] Server receives credit updates
- [ ] Production URL configured
- [ ] App built and tested

---

## 🎉 You're Done!

The desktop app now has:
- ✅ Secure authentication
- ✅ Automatic credit synchronization
- ✅ No manual key management required
- ✅ Session-based credit tracking
- ✅ Seamless user experience

Users simply login once, and everything works automatically!
