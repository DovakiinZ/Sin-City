-- Fix 431 Error: Clear avatarDataUrl from user metadata
-- Run this in Supabase SQL Editor

-- This removes the large base64 avatar from raw_user_meta_data
-- which was causing the 431 (Request Header Too Large) error

UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data - 'avatarDataUrl'
WHERE raw_user_meta_data ? 'avatarDataUrl';

-- Verify the fix
SELECT id, email, 
       length(raw_user_meta_data::text) as metadata_size,
       raw_user_meta_data
FROM auth.users
LIMIT 10;

-- If metadata_size is now small (< 500), the fix worked!
SELECT 'Done! Now clear browser data and log in again.' as next_step;
