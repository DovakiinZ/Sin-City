-- Minimal script - just add columns one at a time

-- Add ip_hash to guests
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS ip_hash TEXT;

-- Add ip_encrypted to guests  
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS ip_encrypted TEXT;

-- Add ip_source to guests
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS ip_source TEXT;

-- Verify
SELECT 'Columns added to guests' AS status;
