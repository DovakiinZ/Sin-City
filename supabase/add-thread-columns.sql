-- Add thread support columns to posts table
-- Thread ID groups posts together, position orders them within the thread

-- Add thread_id column (UUID to group posts in a thread)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thread_id UUID DEFAULT NULL;

-- Add thread_position column (order within the thread: 1, 2, 3...)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thread_position INTEGER DEFAULT NULL;

-- Create index for efficient thread lookups
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts(thread_id) WHERE thread_id IS NOT NULL;

-- Add constraint: if thread_position exists, thread_id must also exist
ALTER TABLE posts ADD CONSTRAINT check_thread_consistency 
  CHECK (
    (thread_id IS NULL AND thread_position IS NULL) OR 
    (thread_id IS NOT NULL AND thread_position IS NOT NULL AND thread_position > 0)
  );

-- Comment on columns for documentation
COMMENT ON COLUMN posts.thread_id IS 'UUID grouping posts into a thread. NULL for standalone posts.';
COMMENT ON COLUMN posts.thread_position IS 'Position within thread (1, 2, 3...). NULL for standalone posts.';
