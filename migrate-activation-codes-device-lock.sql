-- Migration: Add device locking to existing activation_codes table
-- Run this in Supabase SQL Editor

-- Add device_id column if it doesn't exist
ALTER TABLE public.activation_codes 
ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Add activated_at column if it doesn't exist (should already exist)
ALTER TABLE public.activation_codes 
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Add index for device_id lookups
CREATE INDEX IF NOT EXISTS idx_activation_codes_device_id 
ON public.activation_codes(device_id);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'activation_codes'
  AND column_name IN ('device_id', 'activated_at')
ORDER BY column_name;

-- Success message
SELECT 'Device locking columns added successfully!' as message;
