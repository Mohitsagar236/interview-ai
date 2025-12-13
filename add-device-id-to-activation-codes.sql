-- SQL Migration to add device_id tracking to activation_codes
-- This ensures codes can only be used on the device that first activated them

-- Add device_id column if it doesn't exist
ALTER TABLE public.activation_codes 
ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Add index for device_id lookups
CREATE INDEX IF NOT EXISTS idx_activation_codes_device_id 
ON public.activation_codes(device_id);

-- Comment on the columns
COMMENT ON COLUMN public.activation_codes.device_id IS 'Unique identifier of the device that first activated this code. Locks the code to one device.';
COMMENT ON COLUMN public.activation_codes.activated_at IS 'Timestamp when the code was first activated on a device. NULL means never activated.';

-- Show updated table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'activation_codes'
ORDER BY ordinal_position;

SELECT 'Device ID tracking added to activation_codes table!' as message;
