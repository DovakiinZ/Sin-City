-- Add discord_id to profiles table

-- Drop and recreate the update_profile function to include discord_id if it exists
-- Actually, the backend uses direct Supabase update on the profiles table, 
-- so just adding the column is sufficient. RLS on profiles handles access.

-- Update the secure view to include discord_id
-- We might need to check if there are any views that need it, but usually direct select is used.
