# Header Authentication & Profile Setup Guide

## Overview
This implementation adds user authentication to the header and a complete profile page showing subscription details and usage statistics.

## Features Implemented

### 1. Header Authentication
- **Login/Sign Up Button**: Displays when user is not authenticated
- **User Profile Dropdown**: Shows when user is logged in with:
  - User avatar and name
  - Email address
  - Quick link to profile page
  - Logout button
- **Mobile Support**: Auth buttons in mobile menu

### 2. Profile Page (`profile.html`)
Complete user dashboard with three main sections:

#### Account Details
- Full name
- Email address
- Phone number
- Member since date

#### Subscription Details
- Current plan (Free, Basic, Premium, Pro)
- Plan status (Active/Inactive)
- Start and expiry dates
- Upgrade button (hidden for paid plans)

#### Usage Statistics
- Interview Sessions (used/limit)
- Total Minutes (used/limit)
- AI Responses (used/limit)
- Resume Scans (used/limit)
- Visual progress bars with color coding:
  - Green: 0-70% usage
  - Orange: 70-90% usage
  - Red: 90-100% usage

## Files Created/Modified

### New Files
1. **public/profile.html** - User profile page
2. **public/profile.css** - Profile page styles
3. **public/profile.js** - Profile page functionality
4. **public/header-auth.js** - Header auth state management
5. **supabase-migrations.sql** - Database schema for subscriptions and usage

### Modified Files
1. **public/index.html** - Added auth section to header
2. **public/styles.css** - Added auth styles
3. **public/auth.js** - Fixed sign-up and added forgot password

## Database Setup

Run the SQL migration file in your Supabase SQL editor:

```sql
-- Located in: supabase-migrations.sql
```

This creates three tables:
1. **subscriptions** - User subscription data
2. **usage_stats** - Usage tracking
3. **activity_log** - User activity history

### Default User Initialization
When a user signs up, they automatically get:
- Free plan subscription
- Empty usage stats (0 for all metrics)

## Usage Limits by Plan

```javascript
const limits = {
    'free': { 
        sessions: 10, 
        minutes: 60, 
        responses: 100, 
        scans: 5 
    },
    'basic': { 
        sessions: 50, 
        minutes: 300, 
        responses: 500, 
        scans: 20 
    },
    'premium': { 
        sessions: ∞, 
        minutes: ∞, 
        responses: ∞, 
        scans: ∞ 
    },
    'pro': { 
        sessions: ∞, 
        minutes: ∞, 
        responses: ∞, 
        scans: ∞ 
    }
};
```

## Integration Points

### Updating Usage Stats
When your app records interview activity, update the usage_stats table:

```javascript
// Example: Increment session count
const { data, error } = await supabase
    .from('usage_stats')
    .update({ 
        sessions_used: currentCount + 1,
        last_session_date: new Date().toISOString()
    })
    .eq('user_id', userId);
```

### Recording Subscription Changes
After successful payment, update subscriptions table:

```javascript
const { data, error } = await supabase
    .from('subscriptions')
    .update({
        plan_type: 'premium',
        status: 'active',
        payment_id: paymentId,
        order_id: orderId,
        amount: 499,
        start_date: new Date().toISOString(),
        end_date: null // null for lifetime
    })
    .eq('user_id', userId);
```

## Responsive Design
- Desktop: Full profile dropdown in header
- Tablet/Mobile: Auth buttons in mobile menu
- Profile page adapts to single column on mobile

## Testing Checklist

1. **Header State**
   - [ ] Login button shows when not authenticated
   - [ ] Profile dropdown shows when authenticated
   - [ ] Clicking profile shows menu
   - [ ] Menu shows correct user info
   - [ ] Logout works correctly

2. **Profile Page**
   - [ ] Redirects to auth.html if not logged in
   - [ ] Displays user information correctly
   - [ ] Shows subscription details
   - [ ] Displays usage statistics
   - [ ] Tab navigation works
   - [ ] Logout button works

3. **Mobile Experience**
   - [ ] Mobile menu shows auth buttons
   - [ ] Profile page is responsive
   - [ ] All features work on mobile

## Future Enhancements

1. **Activity Feed**: Show recent actions in usage section
2. **Email Preferences**: Add email notification settings
3. **Export Data**: Allow users to download their data
4. **Account Deletion**: Self-service account deletion
5. **Profile Picture Upload**: Custom avatar support
6. **Usage Charts**: Visual graphs for usage over time

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Supabase connection
3. Ensure database tables are created
4. Check RLS policies are enabled
