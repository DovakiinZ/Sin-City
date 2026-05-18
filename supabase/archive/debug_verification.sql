-- Check if 'npnp' exists and what their display name is
SELECT id, username, display_name FROM profiles WHERE username = 'npnp';

-- Check the user_id on the 'Nopee' posts
SELECT author_name, user_id FROM posts WHERE author_name ILIKE '%Nopee%' LIMIT 5;

-- Check if that post user_id exists in profiles
SELECT * FROM profiles WHERE id IN (
  SELECT user_id FROM posts WHERE author_name ILIKE '%Nopee%' LIMIT 5
);
