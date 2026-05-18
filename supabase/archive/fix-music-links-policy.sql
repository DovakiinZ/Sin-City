-- Migration: Fix music_links RLS policy to allow admins to view all songs
-- This fixes the issue where newly added songs don't appear in the admin interface

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Music links are viewable by everyone" ON music_links;

-- Create new policy that allows authenticated users to see all music links
-- while anonymous users can only see active ones
CREATE POLICY "Music links are viewable by everyone"
  ON music_links FOR SELECT
  USING (
    is_active = true OR auth.role() = 'authenticated'
  );
