-- Add display_name column to profiles table if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Make sure all profile columns exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS twitter_username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_username TEXT;
