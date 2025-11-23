-- Enable Real-time Replication for Sin City Blog
-- Run this AFTER enhanced-schema.sql

-- Note: These commands require superuser privileges
-- You can also enable these via Supabase Dashboard:
-- Database > Replication > supabase_realtime > Edit

-- Enable realtime for posts table
alter publication supabase_realtime add table public.posts;

-- Enable realtime for comments table
alter publication supabase_realtime add table public.comments;

-- Enable realtime for reactions table
alter publication supabase_realtime add table public.reactions;

-- Verify realtime is enabled
select * from pg_publication_tables where pubname = 'supabase_realtime';
