-- Add social media columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS twitter_username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_username TEXT;
