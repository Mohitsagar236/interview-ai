# Database Setup Instructions - Fix "Database Error"

## The Problem
The desktop app login is failing with a "Database error" because the `api_keys` table doesn't exist in your Supabase database yet.

## The Solution
You need to run the migration SQL to create the required table and security policies.

---

## Option 1: Run Migration via Supabase Dashboard (RECOMMENDED)

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/npdysfxewryqcmmztdxl/sql
2. Click on "New query" or open the SQL Editor

### Step 2: Copy and Execute Migration SQL
1. Open the file `api-keys-migration.sql` in this folder
2. Copy ALL the contents (Ctrl+A, then Ctrl+C)
3. Paste into the Supabase SQL Editor
4. Click "Run" or press Ctrl+Enter

### Step 3: Verify
You should see:
- ✅ Success message
- ✅ New table `api_keys` created
- ✅ Policies created

---

## Option 2: Run Migration via Script (Alternative)

```powershell
node run-api-keys-migration.js
```

**Note:** This may not work due to Supabase API limitations. Option 1 is more reliable.

---

## What the Migration Creates

### Table: `api_keys`
Stores API keys for desktop app authentication:
- `id` - Unique identifier
- `user_id` - Links to auth.users
- `api_key_hash` - Hashed API key (secure)
- `key_prefix` - First 12 chars for display
- `created_at` - When key was generated
- `last_used_at` - Last login timestamp
- `is_active` - Enable/disable key

### Security Policies (RLS)
- Users can only see/manage their own API keys
- API key validation is secure
- Service role has full access for admin operations

---

## After Migration

1. **Verify Table Exists**
   - Go to: https://supabase.com/dashboard/project/npdysfxewryqcmmztdxl/editor
   - Check if `api_keys` table appears in the table list

2. **Test Desktop Login**
   - Restart the desktop app
   - Try logging in with your email/password
   - It should now work!

---

## Troubleshooting

### "Login failed" after migration
- Make sure you have a user account in Supabase Auth
- Make sure the local dev server is running: `node local-dev-server.js`
- Check if you have credits in the subscriptions table

### "Cannot connect to server"
- Ensure local dev server is running on port 3000
- Check terminal for any errors

### "Still getting database error"
- Verify the migration ran successfully in Supabase dashboard
- Check the RLS policies are enabled
- Try refreshing the Supabase dashboard

---

## Quick Test

After running the migration, test if it worked:

1. Start the local dev server:
   ```powershell
   node local-dev-server.js
   ```

2. Test the API endpoint:
   ```powershell
   curl http://localhost:3000/api/validate-key
   ```

3. Start the desktop app:
   ```powershell
   npm start
   ```

4. Try logging in with your email/password

---

## Next Steps

Once the migration is complete:
1. ✅ Desktop app login should work
2. ✅ API keys will be auto-generated on first login
3. ✅ Credits will sync from Supabase
4. ✅ Sessions will be blocked without credits
