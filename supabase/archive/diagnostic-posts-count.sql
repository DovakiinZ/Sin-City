-- Diagnostic: Check why posts are not appearing
-- Run this in Supabase SQL Editor

-- 1. Total posts count
SELECT COUNT(*) as total_posts FROM posts;

-- 2. Posts filtered by hidden status
SELECT 
  'All posts' as category,
  COUNT(*) as count
FROM posts
UNION ALL
SELECT 
  'Hidden posts (hidden=true)' as category,
  COUNT(*) as count
FROM posts WHERE hidden = true
UNION ALL
SELECT 
  'Draft posts (draft=true)' as category,
  COUNT(*) as count
FROM posts WHERE draft = true
UNION ALL
SELECT 
  'Thread posts (position > 1)' as category,
  COUNT(*) as count
FROM posts WHERE thread_position IS NOT NULL AND thread_position > 1
UNION ALL
SELECT 
  'Visible standalone posts' as category,
  COUNT(*) as count
FROM posts 
WHERE (hidden IS NULL OR hidden = false)
  AND (thread_position IS NULL OR thread_position = 1);

-- 3. Posts breakdown by month (to see if old posts exist)
SELECT 
  TO_CHAR(created_at, 'YYYY-MM') as month,
  COUNT(*) as count
FROM posts
GROUP BY TO_CHAR(created_at, 'YYYY-MM')
ORDER BY month DESC;

-- 4. Sample of oldest visible posts
SELECT id, title, created_at, hidden, draft, thread_position
FROM posts
WHERE (hidden IS NULL OR hidden = false)
ORDER BY created_at ASC
LIMIT 10;
