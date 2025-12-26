-- Chat System Tables
-- Run this in Supabase SQL Editor

-- =============================================
-- CHAT SESSIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_1 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    participant_2 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    participant_1_anonymous BOOLEAN DEFAULT false,
    participant_2_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(participant_1, participant_2)
);

-- Enable RLS
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.chat_sessions;

-- Policies for chat_sessions
CREATE POLICY "Users can view their own sessions" ON public.chat_sessions
    FOR SELECT USING (
        auth.uid() = participant_1 OR auth.uid() = participant_2
    );

CREATE POLICY "Users can create sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (
        auth.uid() = participant_1 OR auth.uid() = participant_2
    );

CREATE POLICY "Users can update their own sessions" ON public.chat_sessions
    FOR UPDATE USING (
        auth.uid() = participant_1 OR auth.uid() = participant_2
    );

CREATE POLICY "Users can delete their own sessions" ON public.chat_sessions
    FOR DELETE USING (
        auth.uid() = participant_1 OR auth.uid() = participant_2
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_participant_1 ON public.chat_sessions(participant_1);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_participant_2 ON public.chat_sessions(participant_2);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON public.chat_sessions(updated_at DESC);

-- =============================================
-- SESSION MESSAGES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.session_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    use_masked_identity BOOLEAN DEFAULT false,
    masked_alias TEXT,
    content TEXT,
    media_url TEXT,
    media_type TEXT CHECK (media_type IN ('image', 'video')),
    gif_url TEXT,
    gif_id TEXT,
    voice_url TEXT,
    voice_duration_seconds INTEGER,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view messages in their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can send messages in their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can update read status" ON public.session_messages;

-- Policies for session_messages
CREATE POLICY "Users can view messages in their sessions" ON public.session_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions cs
            WHERE cs.id = session_id
            AND (cs.participant_1 = auth.uid() OR cs.participant_2 = auth.uid())
        )
    );

CREATE POLICY "Users can send messages in their sessions" ON public.session_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.chat_sessions cs
            WHERE cs.id = session_id
            AND (cs.participant_1 = auth.uid() OR cs.participant_2 = auth.uid())
        )
    );

CREATE POLICY "Users can update read status" ON public.session_messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions cs
            WHERE cs.id = session_id
            AND (cs.participant_1 = auth.uid() OR cs.participant_2 = auth.uid())
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_messages_session_id ON public.session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_sender_id ON public.session_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_created_at ON public.session_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_messages_read_at ON public.session_messages(read_at) WHERE read_at IS NULL;

-- =============================================
-- USER PRESENCE TABLE (for online status)
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_presence (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline'))
);

-- Enable RLS
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users can upsert own presence" ON public.user_presence;

-- Anyone can read presence
CREATE POLICY "Anyone can view presence" ON public.user_presence
    FOR SELECT USING (true);

-- Users can update their own presence
CREATE POLICY "Users can update own presence" ON public.user_presence
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can upsert own presence" ON public.user_presence
    FOR UPDATE USING (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON public.user_presence(last_seen DESC);

-- =============================================
-- TRIGGER: Update session updated_at on new message
-- =============================================
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.chat_sessions
    SET updated_at = now()
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_session_timestamp ON public.session_messages;
CREATE TRIGGER trigger_update_session_timestamp
    AFTER INSERT ON public.session_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_session_timestamp();

-- =============================================
-- Enable Realtime for messages (ignore if already added)
-- =============================================
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;
