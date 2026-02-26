-- Run this DIRECTLY in Supabase SQL Editor to fix the display issue NOW

-- Fix all posts with ANON-ASEEL author name
UPDATE public.posts 
SET author_name = 'Anonymous'
WHERE LOWER(author_name) LIKE '%anon-aseel%' 
   OR LOWER(author_name) = 'anon-aseel';

-- Fix all comments with ANON-ASEEL author name  
UPDATE public.comments 
SET author_name = 'Anonymous'
WHERE LOWER(author_name) LIKE '%anon-aseel%'
   OR LOWER(author_name) = 'anon-aseel';

-- Verify
SELECT 'Remaining posts with ANON-ASEEL:' as check, COUNT(*) as count
FROM posts WHERE LOWER(author_name) LIKE '%anon-aseel%';

SELECT 'Remaining comments with ANON-ASEEL:' as check, COUNT(*) as count  
FROM comments WHERE LOWER(author_name) LIKE '%anon-aseel%';
