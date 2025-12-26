-- Clean up orphaned session_messages that reference non-existent sessions
-- Then fix the foreign key constraint

-- Step 1: Delete orphaned messages (those referencing sessions that don't exist in chat_sessions)
DELETE FROM public.session_messages
WHERE session_id NOT IN (SELECT id FROM public.chat_sessions);

-- Step 2: Now the FK constraint should work
-- It may already be fixed from the previous run, but let's ensure it's correct
ALTER TABLE public.session_messages 
DROP CONSTRAINT IF EXISTS session_messages_session_id_fkey;

ALTER TABLE public.session_messages
ADD CONSTRAINT session_messages_session_id_fkey 
FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

-- Verify
SELECT 'Remaining messages' AS check, COUNT(*) as count FROM public.session_messages;
SELECT 'Sessions' AS check, COUNT(*) as count FROM public.chat_sessions;
