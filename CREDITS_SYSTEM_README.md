# 💳 Credits System - Interview AI Desktop App

## Overview

The Interview AI desktop app now includes a **time-based credits system** where users purchase credits to use interview sessions. Each credit equals one hour of interview time.

### Key Features

✅ **1 Credit = 1 Hour** of interview time  
✅ **Real-time tracking** of credit usage during sessions  
✅ **Automatic deduction** when sessions end  
✅ **Visual display** in toolbar showing remaining credits  
✅ **Profile page** showing detailed credit information  
✅ **Supabase integration** for server-side credit management  
✅ **Local storage** for offline credit tracking

---

## Credit Plans

### Basic Plan - ₹499
- **3 Credits** = 3 hours of interview time
- Perfect for occasional interviews
- Product code: `basic`

### Plus Plan - ₹999
- **8 Credits** = 8 hours (6 + 2 bonus)
- Best value for regular practice
- Product code: `plus`

### Advanced Plan - ₹1,699
- **15 Credits** = 15 hours (9 + 6 bonus)
- For intensive interview preparation
- Product code: `advanced`

---

## How It Works

### 1. Purchase Credits

Users can purchase credits through the payment page:
- Visit `https://yoursite.com/payment.html?product=basic` (or plus/advanced)
- Complete Razorpay payment
- Credits automatically added to their account

### 2. Credits Added to Account

When payment is verified (`api/verify-razorpay-payment.js`):
```javascript
- Basic: 3 credits added
- Plus: 8 credits added  
- Advanced: 15 credits added
```

Credits are stored in Supabase `subscriptions` table:
- `credits_total` - Total credits purchased
- `credits_used` - Credits consumed so far

### 3. Desktop App Syncs Credits

When user opens the desktop app:
- App checks for credits via IPC handlers
- Syncs with Supabase (if available)
- Displays remaining credits in toolbar

### 4. Session Tracking

During interview session:
- App tracks elapsed time in real-time
- Displays current session time
- Warns if credits running low

### 5. Credit Deduction

When session ends:
- Time is calculated in hours
- Rounded up to nearest 0.1 hour (6 minutes)
- Credits automatically deducted
- Updated in local storage and Supabase

**Example:**
- Session duration: 42 minutes
- Time in hours: 0.7 hours
- Credits deducted: 0.7 credits

---

## Technical Implementation

### Database Schema

**File:** `supabase-migrations.sql`

```sql
CREATE TABLE subscriptions (
    ...
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    ...
);
```

**Migration:** `credits-migration.sql` - Add credits columns to existing tables

### Backend Components

#### 1. Credits Manager (`electron/credits-manager.js`)

Core functionality:
- `loadCredits()` - Get current credits
- `startSession(id)` - Begin tracking session
- `endSession(id, duration)` - Deduct credits
- `syncFromServer(userId, supabase)` - Sync with Supabase
- `hasCredits(hours)` - Check if user has enough credits

#### 2. IPC Handlers (`electron/main.js`)

Electron IPC handlers for renderer communication:
- `credits-load` - Load current credits
- `credits-sync` - Sync with server
- `credits-check` - Verify available credits
- `credits-start-session` - Start session tracking
- `credits-end-session` - End session and deduct
- `credits-get-active-session` - Get current session info
- `credits-add` - Manually add credits (admin/testing)

#### 3. Session Integration

Modified `interview-start-session` and `interview-end-session` handlers to:
- Check credits before starting
- Track time during session
- Deduct credits when ending
- Notify UI of changes

### Frontend Components

#### 1. Toolbar Display (`renderer/toolbar.html`)

Visual credits display in the toolbar:
```html
<div class="credits-display">
  <svg><!-- coin icon --></svg>
  <div class="credits-text">
    <span class="credits-amount">5.2</span>
    <span class="credits-label">credits</span>
  </div>
</div>
```

Styling:
- Green: Normal credits (> 1 hour)
- Yellow: Low credits (< 1 hour)
- Red: No credits (0 hours)

#### 2. Toolbar Logic (`renderer/toolbar.js`)

Functions:
- `loadCredits()` - Fetch credits on startup
- `updateCreditsUI(credits)` - Update display
- Click handler to show detailed credits info

#### 3. Profile Page (`public/profile.html` & `profile.js`)

Displays:
- Total credits purchased
- Credits used
- Credits remaining
- Hours available
- Color-coded visual indicator

### Payment Integration

#### `api/verify-razorpay-payment.js`

When payment is verified:
1. Find user by email in Supabase
2. Check existing subscription
3. Add credits based on plan:
   - Basic: +3 credits
   - Plus: +8 credits
   - Advanced: +15 credits
4. Update or create subscription record

---

## Usage Examples

### For Users

**Check Credits:**
- Look at toolbar - shows remaining hours
- Click credits display for details
- Visit profile page for full breakdown

**Purchase Credits:**
1. Click "Get Credits" in profile
2. Choose a plan (Basic/Plus/Advanced)
3. Complete payment
4. Credits added automatically

**Use Credits:**
1. Start interview session
2. App checks if credits available
3. Session tracked in real-time
4. Credits deducted when session ends

### For Developers

**Load Credits:**
```javascript
const result = await window.electronAPI.invoke('credits-load');
console.log(result.credits); // { total, used, remaining, ... }
```

**Check Before Session:**
```javascript
const check = await window.electronAPI.invoke('credits-check', 1.0);
if (check.hasCredits) {
  // Start session
}
```

**Add Credits (Testing):**
```javascript
await window.electronAPI.invoke('credits-add', 5);
```

---

## Data Storage

### Local Storage (Desktop App)

Files in user data directory:
- `credits.json` - Current credit balance
- `credit-sessions.json` - Session history

### Server Storage (Supabase)

Table: `subscriptions`
- `user_id` - User reference
- `credits_total` - Total purchased
- `credits_used` - Total consumed
- `plan_type` - Current plan

---

## User Experience Flow

### First Time User
1. Download and install desktop app
2. Sign up / login
3. See "0 credits" in toolbar
4. Click "Get Credits" → Redirected to payment
5. Purchase plan → Credits added
6. Return to app → Credits displayed
7. Start interview → Credits deducted

### Returning User
1. Open desktop app
2. App syncs credits from server
3. See remaining hours in toolbar
4. Start sessions → Credits deducted automatically
5. When low: Warning displayed
6. When zero: Cannot start new sessions

---

## Error Handling

### No Credits
- User cannot start new session
- Clear error message displayed
- "Get Credits" button shown

### Sync Failures
- App uses local cache
- Continues to work offline
- Syncs when connection restored

### Session Interruption
- Session auto-saved on app close
- Credits deducted on next startup
- No credit loss

---

## Configuration

### Environment Variables

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

### Credit Pricing (Customizable)

Edit in `api/verify-razorpay-payment.js`:
```javascript
const PLAN_CREDITS = {
    basic: 3,
    plus: 8,
    advanced: 15
};
```

---

## Testing

### Manual Testing

1. **Purchase Flow:**
   - Test payment → verify credits added
   - Check Supabase subscription record
   - Verify desktop app displays credits

2. **Session Flow:**
   - Start session → check credits
   - Run session for X minutes
   - End session → verify deduction
   - Check remaining credits accurate

3. **Edge Cases:**
   - Start with 0.5 credits → short session works
   - Start with 0 credits → blocked
   - Session > available credits → uses all

### Automated Testing

```javascript
// Test credit deduction calculation
const timeSeconds = 3600; // 1 hour
const timeHours = timeSeconds / 3600; // 1.0
const creditsDeducted = Math.ceil(timeHours * 10) / 10; // 1.0

// Test with 42 minutes
const timeSeconds = 2520; // 42 minutes
const timeHours = timeSeconds / 3600; // 0.7
const creditsDeducted = Math.ceil(timeHours * 10) / 10; // 0.7
```

---

## Future Enhancements

### Planned Features

- [ ] Credit purchase within desktop app
- [ ] Credit expiration dates
- [ ] Credit transfer between users
- [ ] Subscription auto-renewal
- [ ] Promotional bonus credits
- [ ] Referral credit rewards
- [ ] Usage analytics dashboard
- [ ] Credit usage notifications
- [ ] Bulk credit packages

### Potential Improvements

- Real-time server sync during sessions
- Credit pause/resume functionality
- Session time estimation before starting
- Credit usage history graph
- Mobile app credit display

---

## Support & Troubleshooting

### Common Issues

**Credits not showing:**
- Check internet connection
- Verify Supabase credentials
- Check browser console for errors
- Try manual sync

**Credits not deducting:**
- Check session actually ended
- Verify local storage permissions
- Check main.js IPC handlers working

**Payment not adding credits:**
- Verify payment webhook received
- Check Supabase subscription table
- Verify user_id matches
- Check API logs for errors

---

## Files Modified/Created

### New Files
- `electron/credits-manager.js` - Core credits logic
- `credits-migration.sql` - Database migration
- `CREDITS_SYSTEM_README.md` - This file

### Modified Files
- `supabase-migrations.sql` - Added credit columns
- `electron/main.js` - Added IPC handlers
- `renderer/toolbar.html` - Added credits UI
- `renderer/toolbar.js` - Added credits functions
- `api/verify-razorpay-payment.js` - Credit addition logic
- `public/profile.html` - Credits display section
- `public/profile.js` - Credits UI update functions

---

## License & Credits

Part of Interview AI Desktop Application  
© 2025 Interview AI. All rights reserved.

**Contributors:**
- Credits system design and implementation
- Integration with Razorpay payment gateway
- Supabase database schema
- Electron IPC architecture

---

## Contact

For support or questions about the credits system:
- Email: support@interview-ai.app
- Documentation: https://docs.interview-ai.app
- Issues: https://github.com/yourrepo/interview-ai/issues

---

**Last Updated:** November 6, 2025  
**Version:** 1.0.0
