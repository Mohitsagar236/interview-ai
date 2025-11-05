# 📊 Supabase Database Setup - Step by Step

## Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your `interview-ai` project
3. Click on **"SQL Editor"** in the left sidebar (icon looks like `</>`)
4. Click **"New Query"** button

---

## Step 2: Copy and Run This SQL

Copy the entire SQL code below, paste it into the SQL Editor, and click **"Run"** (or press Ctrl+Enter):

```sql
-- ============================================
-- INTERVIEW AI DATABASE SETUP
-- ============================================

-- Step 1: Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies if they exist (for clean setup)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Step 4: Create security policies
-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
    ON profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
    ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- Step 5: Create function to handle updated_at timestamp
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- Step 7: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================
-- SETUP COMPLETE!
-- ============================================
```

---

## Step 3: Verify Setup

After running the SQL, verify everything is set up correctly:

### Check Tables
1. Click on **"Table Editor"** in the left sidebar
2. You should see a `profiles` table
3. Click on it to see the columns:
   - `id` (uuid) - Primary Key
   - `name` (text)
   - `email` (text)
   - `phone` (text)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

### Check Policies
1. Stay in Table Editor, select `profiles` table
2. Click on the **"Policies"** tab at the top
3. You should see 3 policies:
   - ✅ Users can view own profile
   - ✅ Users can insert own profile
   - ✅ Users can update own profile

---

## Step 4: Test the Setup (Optional)

Run this test query in SQL Editor to confirm everything works:

```sql
-- This should return empty (no users yet)
SELECT * FROM profiles;

-- Check if RLS is enabled (should return true)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'profiles';
```

---

## What This Does

### 🔒 Security Features:
- **Row Level Security (RLS)**: Ensures users can only access their own data
- **Policies**: Define what operations users can perform
- **Authentication**: Only authenticated users can interact with profiles

### 📝 Automatic Features:
- **Auto-Timestamps**: `created_at` is set when profile is created
- **Update Tracking**: `updated_at` automatically updates on any change
- **Email Index**: Fast lookups by email address

### 🔐 What Users Can Do:
- ✅ View their own profile
- ✅ Create their own profile (on signup)
- ✅ Update their own profile
- ❌ Cannot view other users' profiles
- ❌ Cannot edit other users' profiles
- ❌ Cannot delete any profiles

---

## Troubleshooting

### Error: "relation 'profiles' already exists"
**Solution**: The table already exists. Skip to Step 3 to verify.

### Error: "permission denied for table profiles"
**Solution**: You need to be the project owner. Check your role in Project Settings.

### Error: "function handle_updated_at() already exists"
**Solution**: This is fine. The function is already created. Continue with verification.

### No policies showing up
**Solution**: 
1. Refresh the page
2. Or run: `SELECT * FROM pg_policies WHERE tablename = 'profiles';`

---

## ✅ You're Done!

Your database is now ready for authentication. The profiles table will automatically store user data when they sign up through your app.

**Next Step**: Update your `auth.js` with Supabase credentials and start testing!
