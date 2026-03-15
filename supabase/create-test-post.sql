-- Create a test post to verify the posts page works
-- Run this in Supabase SQL Editor

INSERT INTO posts (
  title,
  type,
  content,
  draft,
  author_name,
  created_at
) VALUES (
  'Welcome to Sin City',
  'Text',
  '# Hello World!

This is your first post on Sin City blog.

## Getting Started

You can create more posts by:
1. Going to `/create` page
2. Filling in the title and content
3. Clicking "Publish Post"

Enjoy your ASCII-themed blog!',
  false,  -- IMPORTANT: draft = false means it's published
  'Bassam',
  NOW()
);

-- Verify the post was created
SELECT id, title, draft, created_at 
FROM posts 
ORDER BY created_at DESC 
LIMIT 1;
