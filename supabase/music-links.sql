-- Migration: Create music_links table for admin-managed music playlist
-- This table stores songs that appear in the "Hear This" button

CREATE TABLE IF NOT EXISTS music_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL CHECK (platform IN ('Spotify', 'YouTube Music')),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_music_links_active ON music_links(is_active);
CREATE INDEX IF NOT EXISTS idx_music_links_created_at ON music_links(created_at DESC);

-- Enable Row Level Security
ALTER TABLE music_links ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view active music links (for the "Hear This" button)
CREATE POLICY "Music links are viewable by everyone"
  ON music_links FOR SELECT
  USING (is_active = true);

-- Policy: Authenticated users can insert music links
CREATE POLICY "Authenticated users can insert music links"
  ON music_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can update their own music links
CREATE POLICY "Users can update their own music links"
  ON music_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- Policy: Users can delete their own music links
CREATE POLICY "Users can delete their own music links"
  ON music_links FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Insert some default songs to get started
INSERT INTO music_links (platform, url, title, is_active) VALUES
  ('Spotify', 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp', 'Mr. Brightside - The Killers', true),
  ('Spotify', 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', 'Blinding Lights - The Weeknd', true),
  ('Spotify', 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3', 'Shape of You - Ed Sheeran', true),
  ('Spotify', 'https://open.spotify.com/track/60nZcImufyMA1MKQY3dcCH', 'God''s Plan - Drake', true),
  ('YouTube Music', 'https://music.youtube.com/watch?v=fJ9rUzIMcZQ', 'Bohemian Rhapsody - Queen', true),
  ('YouTube Music', 'https://music.youtube.com/watch?v=kJQP7kiw5Fk', 'Despacito - Luis Fonsi', true),
  ('YouTube Music', 'https://music.youtube.com/watch?v=RgKAFK5djSk', 'Waka Waka - Shakira', true),
  ('YouTube Music', 'https://music.youtube.com/watch?v=CevxZvSJLk8', 'Rockstar - Post Malone', true)
ON CONFLICT (url) DO NOTHING;
