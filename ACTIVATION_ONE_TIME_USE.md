# Activation Code One-Time Use Security Feature

## Overview
Desktop app activation codes are now **locked to a single device** after first use, preventing users from sharing codes with others.

## How It Works

### First Activation
1. User generates an activation code from their web profile
2. User enters the code in the desktop app
3. The system records:
   - `activated_at` - Timestamp of first activation
   - `device_id` - Unique identifier of the device (format: `platform-hostname`)
   - The code becomes **permanently locked** to this device

### Subsequent Attempts

#### Same Device ✅
- User can reactivate the desktop app on the **same device** (e.g., after app restart)
- The system recognizes the matching device_id and allows activation

#### Different Device ❌
- If someone tries to use the code on a **different device**:
  - The system detects device_id mismatch
  - Returns **403 Forbidden** error
  - Shows message: "This activation code has already been activated on another device"
  - **Code sharing is blocked!**

## Database Schema

```sql
activation_codes (
    id UUID PRIMARY KEY,
    user_id UUID,
    code TEXT UNIQUE,
    activated_at TIMESTAMPTZ,  -- NULL = never used, timestamp = first use time
    device_id TEXT,             -- Locked device identifier
    device_info JSONB,          -- Full device details
    is_active BOOLEAN,
    ...
)
```

## API Response Examples

### First Activation (Success)
```json
{
  "success": true,
  "message": "Desktop app activated successfully - code is now locked to this device",
  "isFirstActivation": true,
  "deviceLocked": true,
  "user": { "id": "...", "email": "..." },
  "credits": { "total": 100, "used": 0, "remaining": 100 }
}
```

### Same Device Reactivation (Success)
```json
{
  "success": true,
  "message": "Desktop app reactivated successfully",
  "isFirstActivation": false,
  "deviceLocked": true,
  "user": { "id": "...", "email": "..." },
  "credits": { "total": 100, "used": 10, "remaining": 90 }
}
```

### Different Device (Blocked)
```json
{
  "error": "Activation code already in use",
  "details": "This activation code has already been activated on another device. Each code can only be used on one device to prevent sharing. Please generate a new code from your profile if you need to activate a different device.",
  "alreadyActivated": true
}
```

## Implementation Files

### Modified Files
1. **`api/_lib/activation-codes.js`**
   - `activateDesktopEndpoint()` - Device locking logic
   - Checks device_id on activation
   - Records activated_at and device_id on first use
   - Blocks different devices

2. **`COMPLETE_DATABASE_MIGRATION.sql`**
   - Added `activated_at` and `device_id` columns
   - Added index on device_id

3. **`create-activation-codes-table.sql`**
   - Updated schema with device locking fields

### New Files
1. **`add-device-id-to-activation-codes.sql`**
   - Migration script to add device_id column to existing databases

## Migration Steps

### For New Installations
Run `COMPLETE_DATABASE_MIGRATION.sql` - includes device locking fields

### For Existing Installations
1. Run the migration:
   ```sql
   -- In Supabase SQL Editor
   ALTER TABLE public.activation_codes 
   ADD COLUMN IF NOT EXISTS device_id TEXT;
   
   CREATE INDEX IF NOT EXISTS idx_activation_codes_device_id 
   ON public.activation_codes(device_id);
   ```

2. Deploy updated API code (`api/_lib/activation-codes.js`)

3. Existing codes (activated_at = NULL) will lock to device on next use

## Security Benefits

✅ **Prevents Code Sharing** - Users cannot share codes with friends/family
✅ **One Device Per Code** - Each code works only on the device that first used it
✅ **Automatic Enforcement** - No user intervention needed
✅ **Allows Reactivation** - Same device can reactivate after app restart
✅ **Clear Error Messages** - Users understand why code doesn't work elsewhere

## User Experience

### For Legitimate Users
- Seamless experience on their own device
- Can close/restart app without issues
- Clear instructions if they need multiple devices

### For Code Sharers
- Code fails on second device
- Clear message explaining the restriction
- Directed to generate new code if they have multiple devices

## Testing

Test the one-time use feature:
1. Generate activation code on web profile
2. Activate on Device A - should succeed
3. Try same code on Device B - should fail with 403
4. Reactivate on Device A - should succeed
5. Check database: `activated_at` should have timestamp, `device_id` should be set

## Logs

The system logs detailed activation attempts:
```
[Activation] Device ID: windows-DESKTOP-XYZ
[Activation] Code already activated: true
[Activation] Stored device ID: windows-DESKTOP-XYZ
[Activation] Same device reactivation - allowed
```

Or for blocked attempts:
```
[Activation] BLOCKED - Code already used on different device
[Activation] Stored device: windows-DESKTOP-XYZ
[Activation] Current device: macos-MACBOOK-ABC
```

## Future Enhancements

Potential improvements:
- Allow users to "reset" device lock from web profile (with email confirmation)
- Track multiple devices with limits (e.g., max 2 devices per code)
- Add device management UI to see/revoke devices
- Email notifications when code is used on new device
