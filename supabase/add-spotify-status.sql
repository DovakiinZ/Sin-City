-- Add spotify_status JSONB column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS spotify_status JSONB;
