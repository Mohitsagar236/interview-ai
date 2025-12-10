# Credits System

The Interview AI desktop app uses a **time-based credits system** where users purchase credits for interview sessions.

## Overview

| Feature | Description |
|---------|-------------|
| **1 Credit = 1 Hour** | Each credit equals one hour of interview time |
| **Real-time Tracking** | Credits tracked during active sessions |
| **Automatic Deduction** | Credits deducted when sessions end |
| **Cloud Sync** | Credits synced with Supabase |

---

## Credit Plans

| Plan | Price | Credits | Best For |
|------|-------|---------|----------|
| **Basic** | ₹499 | 3 hours | Occasional interviews |
| **Plus** | ₹999 | 8 hours (6 + 2 bonus) | Regular practice |
| **Advanced** | ₹1,699 | 15 hours (9 + 6 bonus) | Intensive preparation |

---

## How It Works

### 1. Purchase Credits

Users purchase through the payment page:
```
https://yoursite.com/payment.html?product=basic
```

### 2. Credits Added

After payment verification, credits are added to Supabase:
- Basic: 3 credits
- Plus: 8 credits
- Advanced: 15 credits

### 3. Desktop App Syncs

When the app opens:
1. Checks for credits via IPC handlers
2. Syncs with Supabase
3. Displays remaining credits in toolbar

### 4. Session Tracking

During interviews:
- Real-time elapsed time tracking
- Low credit warnings
- Automatic session end at 0 credits

### 5. Credit Deduction

When session ends:
- Time calculated in hours
- Rounded up to nearest 0.1 hour (6 minutes)
- Deducted from balance

**Example:**
- Session: 42 minutes → 0.7 hours deducted

---

## Database Schema

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    plan_type VARCHAR(50),
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Get Credits
```javascript
GET /api/get-credits-by-code?code=XXXX-XXXX-XXXX-XXXX
```

### Update Credits
```javascript
POST /api/update-credits-by-code
{
  "code": "XXXX-XXXX-XXXX-XXXX",
  "credits_used": 1.5
}
```

---

## Desktop App Integration

### Check Credits
```javascript
// In Electron renderer
const credits = await window.electronAPI.getCredits();
console.log(`Remaining: ${credits.total - credits.used}`);
```

### Display in Toolbar
Credits are shown in the toolbar with:
- Remaining hours
- Current session time
- Low credit warning (< 1 hour)

---

## Troubleshooting

### Credits Not Syncing
1. Check internet connection
2. Verify activation code is valid
3. Check Supabase connection

### Wrong Credit Amount
1. Check payment verification logs
2. Verify plan type in database
3. Contact support with transaction ID

### Session Time Not Tracking
1. Ensure session is active
2. Check IPC handlers in main.js
3. Verify credits-manager.js is loaded
