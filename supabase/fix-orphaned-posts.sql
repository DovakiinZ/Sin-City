-- Replace "Nopee" with "npnp" for all affected posts

UPDATE posts
SET author_name = 'npnp'
WHERE author_name = 'Nopee';

-- Also update "Npnp" to lowercase "npnp" for consistency
UPDATE posts
SET author_name = 'npnp'
WHERE author_name = 'Npnp';

-- Verify the fix
SELECT title, author_name FROM posts 
WHERE author_name ILIKE '%nop%' OR author_name ILIKE '%npnp%'
ORDER BY created_at DESC;
