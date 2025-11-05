# Supabase Authentication Setup Guide

## 🚀 Quick Setup

### 1. Create Supabase Project

1. Go to [Supabase](https://supabase.com)
2. Click "Start your project"
3. Create a new organization (if needed)
4. Create a new project:
   - Project name: `interview-ai`
   - Database password: (generate strong password)
   - Region: Choose closest to your users
   - Wait for project to initialize (~2 minutes)

### 2. Get API Credentials

1. Go to Project Settings → API
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Anon/Public Key** (starts with `eyJ...`)

### 3. Configure the App

Update `public/auth.js` with your credentials:

```javascript
// Replace these lines (around line 6-7):
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// With your actual values:
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### 4. Create Database Tables

Go to SQL Editor in Supabase and run:

```sql
-- Create profiles table
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own profile
CREATE POLICY "Users can view own profile"
    ON profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Create policy to allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
    ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Create policy to allow users to update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- Create function to handle updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();
```

### 5. Configure Email Authentication

1. Go to Authentication → Providers
2. Enable **Email** provider (enabled by default)
3. Optional: Customize email templates in Authentication → Email Templates

### 6. Configure Social Authentication (Optional)

#### Google OAuth:
1. Go to Authentication → Providers → Google
2. Enable Google provider
3. Follow Supabase instructions to set up Google OAuth
4. Add authorized redirect URIs

#### Microsoft OAuth:
1. Go to Authentication → Providers → Azure (Microsoft)
2. Enable Azure provider
3. Follow Supabase instructions to set up Microsoft OAuth
4. Add authorized redirect URIs

### 7. Configure Site URL

1. Go to Authentication → URL Configuration
2. Add your site URLs:
   - Site URL: `http://localhost:3000` (for development)
   - Redirect URLs: 
     - `http://localhost:3000/payment.html`
     - `https://yourdomain.com/payment.html` (for production)

---

## 🎯 Features Implemented

### ✅ Email/Password Authentication
- Sign up with email, password, name, and phone
- Login with email and password
- Password validation (minimum 8 characters)
- Email format validation
- Remember me functionality

### ✅ User Profile Management
- Automatic profile creation on signup
- Profile data stored in `profiles` table
- User metadata (name, phone) stored

### ✅ Social Authentication (Ready)
- Google OAuth integration
- Microsoft OAuth integration
- Automatic redirect after social login

### ✅ Session Management
- Automatic session persistence
- Session validation on protected pages
- Logout functionality

### ✅ Security
- Row Level Security (RLS) enabled
- Users can only access their own data
- Secure password hashing (handled by Supabase)
- JWT token authentication

---

## 🔐 Authentication Flow

### Sign Up:
```
User fills form → Supabase.auth.signUp() → User created
    ↓
Profile created in profiles table
    ↓
User data stored in localStorage
    ↓
Redirect to payment page
```

### Login:
```
User enters credentials → Supabase.auth.signInWithPassword()
    ↓
Session created
    ↓
Profile data fetched
    ↓
User data stored in localStorage
    ↓
Redirect to payment page
```

### Social Login:
```
User clicks Google/Microsoft → Supabase.auth.signInWithOAuth()
    ↓
Redirect to OAuth provider
    ↓
User authorizes
    ↓
Redirect back with session
    ↓
User data populated
    ↓
Redirect to payment page
```

---

## 🧪 Testing

### Test Email/Password:
1. Open `auth.html?product=windows`
2. Sign up with test credentials:
   - Name: Test User
   - Email: test@example.com
   - Phone: +919876543210
   - Password: test1234
3. Should redirect to payment page
4. Try logging out and logging back in

### Test Social Login:
1. Configure Google/Microsoft OAuth in Supabase
2. Click social login button
3. Authorize with your account
4. Should redirect to payment page

---

## 📊 Database Schema

### `auth.users` (Supabase managed)
- id: UUID (primary key)
- email: TEXT
- encrypted_password: TEXT
- email_confirmed_at: TIMESTAMP
- created_at: TIMESTAMP
- user_metadata: JSONB

### `profiles` (Custom table)
- id: UUID (foreign key to auth.users)
- name: TEXT
- email: TEXT
- phone: TEXT
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

---

## 🔧 API Reference

### Sign Up
```javascript
const { data, error } = await supabase.auth.signUp({
    email: 'user@example.com',
    password: 'password123',
    options: {
        data: {
            name: 'John Doe',
            phone: '+919876543210'
        }
    }
});
```

### Login
```javascript
const { data, error } = await supabase.auth.signInWithPassword({
    email: 'user@example.com',
    password: 'password123'
});
```

### Social Login
```javascript
const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
        redirectTo: 'https://yourdomain.com/payment.html'
    }
});
```

### Get Session
```javascript
const { data: { session } } = await supabase.auth.getSession();
```

### Logout
```javascript
const { error } = await supabase.auth.signOut();
```

### Get User Profile
```javascript
const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
```

---

## 🚀 Deployment

### Environment Variables
No environment variables needed in frontend! Supabase credentials are safe to expose in client-side code.

### Production Setup
1. Update Site URL in Supabase dashboard
2. Add production redirect URLs
3. Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in code
4. Deploy your app

---

## 🛡️ Security Best Practices

### ✅ Implemented:
- Row Level Security (RLS) enabled
- Anon key (not service role key) used in frontend
- Email verification available
- Password strength requirements
- Secure session management

### 📝 Recommended:
- Enable email verification for production
- Set up password reset flow
- Add rate limiting for auth endpoints
- Monitor authentication logs
- Set up MFA (Multi-Factor Authentication)

---

## 🔄 Syncing with Payment

User data automatically syncs between authentication and payment:

```javascript
// After login/signup, data is available:
const userData = {
    id: user.id,
    email: user.email,
    name: profile.name,
    phone: profile.phone,
    authenticated: true,
    supabase_session: session
};

// This data is used to pre-fill payment form
```

---

## 📞 Troubleshooting

### "Invalid API credentials"
- Check SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Ensure you're using the anon key, not service role key

### "User already registered"
- User exists, they should login instead
- Check if email confirmation is required

### Social login not working
- Verify OAuth configuration in Supabase dashboard
- Check redirect URLs are correctly configured
- Ensure provider (Google/Microsoft) credentials are valid

### Profile not created
- Check SQL policies are correctly set
- Verify `profiles` table exists
- Check browser console for errors

---

## ✅ Completion Checklist

- [ ] Supabase project created
- [ ] API credentials obtained
- [ ] `auth.js` updated with credentials
- [ ] Database tables created
- [ ] RLS policies configured
- [ ] Email authentication tested
- [ ] Social authentication configured (optional)
- [ ] Site URLs configured
- [ ] Profile creation working
- [ ] Login/logout working
- [ ] Session persistence working
- [ ] Payment page integration working

---

## 🎉 You're Ready!

Your app now uses Supabase for:
- ✅ User authentication
- ✅ User profile management
- ✅ Session management
- ✅ Social login (if configured)
- ✅ Secure data storage

**Next:** Configure your Supabase credentials and test the authentication flow!
