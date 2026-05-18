-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create music_links table if it doesn't exist
CREATE TABLE IF NOT EXISTS music_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL CHECK (platform IN ('Spotify', 'YouTube Music')),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE music_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Music links are viewable by everyone" ON music_links;
DROP POLICY IF EXISTS "Authenticated users can insert music links" ON music_links;
DROP POLICY IF EXISTS "Users can update their own music links" ON music_links;
DROP POLICY IF EXISTS "Authenticated users can update music links" ON music_links;
DROP POLICY IF EXISTS "Users can delete their own music links" ON music_links;
DROP POLICY IF EXISTS "Authenticated users can delete music links" ON music_links;

-- Recreate policies

-- 1. View policy: Everyone can see active songs, Authenticated can see all
CREATE POLICY "Music links are viewable by everyone"
  ON music_links FOR SELECT
  USING (
    is_active = true OR auth.role() = 'authenticated'
  );

-- 2. Insert policy: Only authenticated users can insert
CREATE POLICY "Authenticated users can insert music links"
  ON music_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- 3. Update policy: Authenticated users can update any song (admin)
CREATE POLICY "Authenticated users can update music links"
  ON music_links FOR UPDATE
  TO authenticated
  USING (true);

-- 4. Delete policy: Authenticated users can delete any song (admin)
CREATE POLICY "Authenticated users can delete music links"
  ON music_links FOR DELETE
  TO authenticated
  USING (true);

-- Insert default songs if table is empty
INSERT INTO music_links (platform, url, title, is_active)
SELECT 'Spotify', 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp', 'Mr. Brightside - The Killers', true
WHERE NOT EXISTS (SELECT 1 FROM music_links);

INSERT INTO music_links (platform, url, title, is_active)
SELECT 'Spotify', 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', 'Blinding Lights - The Weeknd', true
WHERE NOT EXISTS (SELECT 1 FROM music_links);

INSERT INTO music_links (platform, url, title, is_active)
SELECT 'YouTube Music', 'https://music.youtube.com/watch?v=fJ9rUzIMcZQ', 'Bohemian Rhapsody - Queen', true
WHERE NOT EXISTS (SELECT 1 FROM music_links);
