# Google OAuth Setup Guide

Complete guide to enable Google login and signup for Interview AI.

## Overview
Your application already has Google OAuth buttons and code implemented. You just need to configure the Google and Supabase settings.

---

## Step 1: Create Google OAuth Credentials

### 1.1 Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Sign in with your Google account

### 1.2 Create or Select a Project
1. Click the project dropdown at the top
2. Click "New Project"
3. Name: "Interview AI" (or your preferred name)
4. Click "Create"
5. Select the newly created project

### 1.3 Enable Google+ API
1. In the sidebar, go to "APIs & Services" → "Library"
2. Search for "Google+ API"
3. Click on it and click "Enable"

### 1.4 Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External" user type
3. Click "Create"
4. Fill in the required fields:
   - **App name**: Interview AI
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click "Save and Continue"
6. On "Scopes" page, click "Add or Remove Scopes"
7. Select these scopes:
   - `userinfo.email`
   - `userinfo.profile`
8. Click "Update" and "Save and Continue"
9. Add test users (your email) if in testing mode
10. Click "Save and Continue"

### 1.5 Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "Interview AI Web Client"
5. **Authorized JavaScript origins**:
   - `http://localhost:3000` (for local development)
   - `https://your-domain.com` (your production domain)
6. **Authorized redirect URIs** (IMPORTANT):
   - `https://npdysfxewryqcmmztdxl.supabase.co/auth/v1/callback`
   - `http://localhost:3000/auth.html` (optional for testing)
7. Click "Create"
8. **SAVE THESE CREDENTIALS** (you'll need them next):
   - Client ID: `xxxxx.apps.googleusercontent.com`
   - Client Secret: `xxxxxxxxxxxxxxxxxxxxxxxx`

---

## Step 2: Configure Supabase

### 2.1 Add Google OAuth Provider
1. Go to your Supabase Dashboard: https://app.supabase.com/project/npdysfxewryqcmmztdxl
2. Navigate to: **Authentication** → **Providers**
3. Find "Google" in the list
4. Click to expand the Google section
5. Toggle "Enable Sign in with Google" to **ON**
6. Fill in the credentials:
   - **Client ID**: Paste from Google Cloud Console (Step 1.5)
   - **Client Secret**: Paste from Google Cloud Console (Step 1.5)
7. Leave "Authorized Client IDs" empty (not needed for web)
8. Click "Save"

### 2.2 Configure Redirect URLs (if not already done)
1. In Supabase Dashboard, go to: **Authentication** → **URL Configuration**
2. Add these Site URLs:
   - `http://localhost:3000`
   - `https://your-production-domain.com`
3. Add these Redirect URLs:
   - `http://localhost:3000/auth.html`
   - `http://localhost:3000/profile.html`
   - `https://your-production-domain.com/auth.html`
   - `https://your-production-domain.com/profile.html`
4. Click "Save"

---

## Step 3: Update Your Application (Already Done!)

Good news! The code is already implemented in your app:

### ✅ Frontend Implementation (Already Present)
- **Google button**: [auth.html](public/auth.html#L137-L140)
- **Click handler**: [auth.js](public/auth.js#L151-L153)
- **OAuth function**: [auth.js](public/auth.js#L392-L414)

### ✅ What the Code Does
1. User clicks "Sign up with Google" button
2. Calls `handleSocialAuth('google')`
3. Redirects to Google login page
4. After Google auth, redirects back to your app
5. Supabase automatically creates user account
6. User is logged in and redirected to profile page

---

## Step 4: Enhance OAuth Callback Handling

While basic OAuth works, let's add proper callback handling to create user profiles:

### 4.1 Add OAuth Callback Handler
The existing code already handles the session, but we should ensure profiles are created for OAuth users. Add this to your [auth.js](public/auth.js):

```javascript
// Add this function to handle OAuth callback
async function handleOAuthCallback() {
    // Check if we're returning from OAuth
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    
    if (accessToken) {
        try {
            // Get the user data
            const { data: { user }, error } = await supabase.auth.getUser(accessToken);
            
            if (error) throw error;
            
            if (user) {
                // Check if profile exists, create if not
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (!existingProfile) {
                    // Create profile for OAuth user
                    await supabase.from('profiles').insert([{
                        id: user.id,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                        email: user.email,
                        phone: user.user_metadata?.phone || '',
                        created_at: new Date().toISOString()
                    }]);
                }
                
                // Store user data in session
                const userData = {
                    id: user.id,
                    email: user.email,
                    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                    authenticated: true,
                    timestamp: Date.now()
                };
                
                sessionStorage.setItem('interviewai_user', JSON.stringify(userData));
                
                // Redirect to intended page
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect') || 'profile.html';
                window.location.href = redirect;
            }
        } catch (error) {
            console.error('OAuth callback error:', error);
            showMessage('Authentication failed. Please try again.', 'error');
        }
    }
}
```

### 4.2 Call Handler on Page Load
Add this to the DOMContentLoaded event:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
    setupTabSwitching();
    setupFormHandlers();
    await handleOAuthCallback(); // Add this line
    await handlePasswordRecoveryIfNeeded();
    if (!recoveryFlowActive) {
        await checkExistingAuth();
    }
});
```

---

## Step 5: Testing

### 5.1 Local Testing
1. Start your development server:
   ```powershell
   npm run dev
   # or
   python local-dev-server.js
   ```
2. Open: http://localhost:3000/auth.html
3. Click "Sign up with Google"
4. Sign in with your Google account
5. You should be redirected back and logged in

### 5.2 Verify in Supabase
1. Go to Supabase Dashboard → **Authentication** → **Users**
2. You should see your Google account listed
3. The provider should show "google"

### 5.3 Check Profile Creation
1. In Supabase Dashboard → **Table Editor** → **profiles**
2. Your profile should be created with data from Google

---

## Troubleshooting

### Error: "redirect_uri_mismatch"
- **Cause**: The redirect URI in Google Console doesn't match Supabase callback URL
- **Fix**: Add `https://npdysfxewryqcmmztdxl.supabase.co/auth/v1/callback` to Google Console

### Error: "Invalid OAuth client"
- **Cause**: Client ID or Secret is incorrect
- **Fix**: Double-check credentials in both Google Console and Supabase

### User signed in but no profile created
- **Cause**: Profile creation trigger not working
- **Fix**: Run the callback handler code (Step 4) to create profiles for OAuth users

### Error: "OAuth flow failed"
- **Cause**: Multiple possible issues
- **Fix**: 
  1. Check browser console for errors
  2. Verify Google+ API is enabled
  3. Check OAuth consent screen is configured
  4. Verify Site URLs in Supabase

---

## Security Notes

1. **Never commit credentials**: Don't add Client Secret to your code
2. **HTTPS in production**: Always use HTTPS for OAuth in production
3. **Validate on server**: OAuth tokens should be validated server-side
4. **Scope minimization**: Only request email and profile scopes

---

## What's Already Working

Your app already has:
- ✅ Google button in UI
- ✅ Click handler attached
- ✅ OAuth redirect implementation
- ✅ Session management
- ✅ User data storage
- ✅ Profile display

You just need to:
1. Configure Google Cloud Console (Step 1)
2. Configure Supabase provider (Step 2)
3. Optionally enhance callback handling (Step 4)

---

## Next Steps

After Google OAuth is working, you can:
1. Add Microsoft OAuth (similar process)
2. Add GitHub OAuth
3. Add email verification for OAuth users
4. Add role-based access control
5. Add OAuth for desktop app

---

## Support

If you encounter issues:
- Check Supabase logs: Dashboard → Logs → Auth Logs
- Check browser console for JavaScript errors
- Verify all URLs match exactly (case-sensitive)
- Test with different Google accounts
