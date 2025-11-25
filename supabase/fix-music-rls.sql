-- Fix Music Links RLS Policy for Authenticated Users
-- This fixes the issue where authenticated users cannot see music links

-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Music links are viewable by everyone" ON music_links;

-- Create corrected policy
-- Anonymous users: can only see active songs (is_active = true)
-- Authenticated users: can see all songs (active and inactive)
CREATE POLICY "Music links are viewable by everyone"
  ON music_links FOR SELECT
  USING (
    is_active = true OR auth.uid() IS NOT NULL
  );
