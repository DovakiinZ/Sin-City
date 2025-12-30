-- Admin Delete Messages Policy
-- Run this in Supabase SQL Editor

-- Add DELETE policy for session_messages
-- Admins and message senders can delete messages

DROP POLICY IF EXISTS "Admins can delete any message" ON public.session_messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.session_messages;

-- Admins can delete any message
CREATE POLICY "Admins can delete any message"
ON public.session_messages FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages"
ON public.session_messages FOR DELETE
TO authenticated
USING (sender_id = auth.uid());

-- Done
SELECT 'Delete policies added successfully' as status;
