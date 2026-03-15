-- Fix: Add DELETE policies for admin chat deletion
-- Run this in Supabase SQL Editor

-- Allow participants to delete messages from their sessions
CREATE POLICY "Users can delete messages from their sessions"
  ON public.session_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

-- Allow participants to delete their own sessions
CREATE POLICY "Users can delete their own sessions"
  ON public.message_sessions FOR DELETE
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- Grant admin full delete access (bypasses RLS via service role, but this helps regular deletes)
-- If you need admin-only delete, use a security definer function instead
