# Desktop App Activation System

The activation system allows desktop app users to authenticate using a simple activation code instead of complex login flows.

## Overview

### How It Works
1. User purchases credits on the website
2. User generates activation code from their profile page
3. User enters code in desktop app
4. App is activated with user's credits

### Benefits
- ✅ No login credentials needed in desktop app
- ✅ Simple 16-character code
- ✅ One-click copy from website
- ✅ Includes credit information
- ✅ Can regenerate if compromised

---

## Activation Code Format

```
XXXX-XXXX-XXXX-XXXX
```

Example: `A1B2-C3D4-E5F6-G7H8`

---

## User Flow

### On Website (profile.html)

1. User logs in to website
2. Goes to Profile page
3. Sees "Desktop App Activation" section
4. Clicks "Copy Code" to copy activation code
5. Code shows credit information

### In Desktop App

1. User launches app
2. Activation window appears
3. User pastes activation code
4. App validates code via API
5. Credits are loaded
6. App is ready to use

---

## Database Schema

```sql
CREATE TABLE activation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    code TEXT UNIQUE NOT NULL,
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    plan_type VARCHAR(50),
    user_email TEXT,
    user_name TEXT,
    is_active BOOLEAN DEFAULT true,
    device_id TEXT,
    activated_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Generate Activation Code
```javascript
POST /api/generate-activation-code
{
  "user_id": "uuid",
  "email": "user@example.com"
}
```

### Activate Desktop App
```javascript
POST /api/activate-desktop
{
  "code": "XXXX-XXXX-XXXX-XXXX",
  "device_id": "device-unique-id"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "email": "user@example.com",
    "name": "John Doe"
  },
  "credits": {
    "total": 8,
    "used": 2,
    "remaining": 6
  }
}
```

### Get Credits by Code
```javascript
GET /api/get-credits-by-code?code=XXXX-XXXX-XXXX-XXXX
```

### Deactivate Code
```javascript
POST /api/deactivate-code
{
  "code": "XXXX-XXXX-XXXX-XXXX"
}
```

---

## Desktop App Implementation

### Activation Manager
```javascript
// electron/desktop-activation-manager.js

class DesktopActivationManager {
  async activate(code) {
    const response = await fetch(`${this.apiBaseUrl}/api/activate-desktop`, {
      method: 'POST',
      body: JSON.stringify({ code, device_id: this.deviceId })
    });
    return response.json();
  }
  
  async getCredits() {
    const code = this.getStoredCode();
    return fetch(`${this.apiBaseUrl}/api/get-credits-by-code?code=${code}`);
  }
}
```

### Activation Window
```javascript
// electron/main.js

function showActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  activationWindow.loadFile('electron/activation.html');
}
```

---

## Security Features

### Code Expiration
- Codes expire after configurable period
- Default: 1 year from generation

### Device Tracking
- Device ID stored with activation
- Can limit to single device

### Code Regeneration
- Users can regenerate code from profile
- Old code is invalidated
- Useful if code is compromised

### Deactivation
- Users can deactivate code manually
- Prevents unauthorized use

---

## Troubleshooting

### Invalid Activation Code
- Check code is copied correctly (no extra spaces)
- Verify code hasn't expired
- Check if code was deactivated

### Code Not Generating
- Ensure user is logged in
- Check if subscription exists
- Verify API endpoint is accessible

### Credits Not Showing
- Sync credits manually (button in app)
- Check internet connection
- Verify activation code is still valid
