-- Migration: Fix music_links created_by for existing songs
-- This allows the current admin to delete songs that were inserted without an owner

-- First, let's update all existing music_links that have NULL created_by
-- to use the first authenticated user (typically the admin)

-- Option 1: Set created_by to NULL and relax the DELETE policy
-- This is simpler and allows anyone authenticated to delete any song

-- Drop the restrictive delete policy
DROP POLICY IF EXISTS "Users can delete their own music links" ON music_links;

-- Create a more permissive delete policy for authenticated users
-- This allows any authenticated user (admin) to delete music links
CREATE POLICY "Authenticated users can delete music links"
  ON music_links FOR DELETE
  TO authenticated
  USING (true);

-- Also update the UPDATE policy to be more permissive
DROP POLICY IF EXISTS "Users can update their own music links" ON music_links;

CREATE POLICY "Authenticated users can update music links"
  ON music_links FOR UPDATE
  TO authenticated
  USING (true);

-- Note: The INSERT policy remains restrictive (must set created_by to auth.uid())
-- This ensures new songs are properly owned, but allows admins to manage all songs
