# Database Setup (Supabase)

This guide covers setting up Supabase as the database for Interview AI.

## Create Supabase Project

1. Go to https://supabase.com
2. Sign up / Log in
3. Click "New Project"
4. Choose organization
5. Enter project details:
   - Name: `interview-ai`
   - Database Password: (save this!)
   - Region: Choose closest to users

---

## Run Database Migrations

### Option 1: SQL Editor (Recommended)

1. Go to SQL Editor in Supabase dashboard
2. Copy and paste from `COMPLETE_DATABASE_MIGRATION.sql`
3. Click "Run"

### Option 2: Supabase CLI

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

---

## Database Schema

### Users Table (Built-in)
Supabase provides `auth.users` automatically.

### Subscriptions Table
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    credits_total INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    razorpay_subscription_id TEXT,
    razorpay_order_id TEXT,
    transaction_id TEXT,
    payment_verified BOOLEAN DEFAULT false,
    payment_verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Activation Codes Table
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

## Row Level Security (RLS)

Enable RLS on all tables:

```sql
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own subscriptions"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "Service role full access"
ON subscriptions FOR ALL
USING (auth.role() = 'service_role');
```

---

## Get API Keys

1. Go to Project Settings → API
2. Copy these values to your `.env`:

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # Safe for client-side
SUPABASE_SERVICE_KEY=eyJhbGc...  # Keep secret! Server-only
```

---

## Test Connection

### From Node.js
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Test query
const { data, error } = await supabase
  .from('subscriptions')
  .select('*')
  .limit(1);

console.log(error ? error : 'Connected!');
```

### From Python
```python
from supabase import create_client
import os

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_ANON_KEY')
)

# Test query
result = supabase.table('subscriptions').select('*').limit(1).execute()
print('Connected!' if not result.error else result.error)
```

---

## Troubleshooting

### Connection Refused
- Check SUPABASE_URL is correct
- Verify project is active (not paused)

### Permission Denied
- Check RLS policies
- Use service key for admin operations

### Table Not Found
- Run migrations first
- Check schema name (public vs custom)
