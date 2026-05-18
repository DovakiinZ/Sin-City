-- Fix for duplicate upsert_guest functions
-- Run this FIRST, then run guest-intelligence-schema.sql again

-- Drop ALL versions of the function
DROP FUNCTION IF EXISTS upsert_guest(TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS upsert_guest(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER, INTEGER);

-- Also clean up any triggers that might conflict
DROP TRIGGER IF EXISTS trigger_increment_guest_posts ON public.posts;
DROP TRIGGER IF EXISTS trigger_update_guest_behavior ON public.posts;
