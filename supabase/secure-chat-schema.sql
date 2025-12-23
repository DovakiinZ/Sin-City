-- ============================================================================
-- SECURE ANONYMOUS CHAT SCHEMA
-- Strict strict separation of User ID and Message Identity
-- ============================================================================

-- 1. THREADS (The container)
CREATE TABLE IF NOT EXISTS public.chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

-- 2. IDENTITIES (The Public Face)
-- This table is visible to everyone in the thread.
-- It contains NO link to auth.users.
CREATE TABLE IF NOT EXISTS public.chat_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_identities ENABLE ROW LEVEL SECURITY;

-- 3. PARTICIPANTS (The Secure Bridge)
-- This maps a real User to an Identity.
-- RLS: Visible ONLY to the specific user (and admin).
-- NO ONE else can see this table to link Identity X to User Y.
CREATE TABLE IF NOT EXISTS public.chat_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    identity_id UUID REFERENCES public.chat_identities(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(thread_id, user_id)
);

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

-- 4. MESSAGES
-- Linked to Identity, NOT User.
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE NOT NULL,
    sender_identity_id UUID REFERENCES public.chat_identities(id) ON DELETE CASCADE NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- THREADS
-- Visible if you are a participant
CREATE POLICY "View threads I am in" ON public.chat_threads
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.thread_id = id AND cp.user_id = auth.uid()
        )
    );

-- IDENTITIES
-- Visible if you are in the same thread
CREATE POLICY "View identities in my threads" ON public.chat_identities
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.thread_id = thread_id AND cp.user_id = auth.uid()
        )
    );

-- PARTICIPANTS (CRITICAL SECURITY)
-- Only visible to SELF. Recipient cannot query this to find who Identity X is.
CREATE POLICY "View own participant link" ON public.chat_participants
    FOR SELECT USING (user_id = auth.uid());

-- MESSAGES
-- Visible if in thread
CREATE POLICY "View messages in my threads" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.thread_id = thread_id AND cp.user_id = auth.uid()
        )
    );


-- ============================================================================
-- FUNCTIONS (The Logic)
-- ============================================================================

-- 1. Create a Private Chat (RPC)
CREATE OR REPLACE FUNCTION start_secure_chat(
    recipient_id UUID,
    is_anonymous BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_thread_id UUID;
    v_my_identity_id UUID;
    v_other_identity_id UUID;
    v_my_name TEXT;
    v_my_avatar TEXT;
    v_other_name TEXT;
    v_other_avatar TEXT;
BEGIN
    -- 1. Create Thread
    INSERT INTO public.chat_threads (type) VALUES ('direct') RETURNING id INTO v_thread_id;

    -- 2. Determine Identities
    
    -- My Identity
    IF is_anonymous THEN
        -- Generate Masked Identity
        v_my_name := 'Unknown_' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 4));
        v_my_avatar := 'https://api.dicebear.com/7.x/bottts/svg?seed=' || v_my_name;
    ELSE
        -- Use Real Profile
        SELECT username, avatar_url INTO v_my_name, v_my_avatar FROM public.profiles WHERE id = auth.uid();
    END IF;

    -- Recipient Identity (Always Real in Direct Chat Init? Or can be anon too? For now assume Recipient is always "themselves" initially)
    SELECT username, avatar_url INTO v_other_name, v_other_avatar FROM public.profiles WHERE id = recipient_id;

    -- 3. Create Identities
    INSERT INTO public.chat_identities (thread_id, display_name, avatar_url, is_anonymous)
    VALUES (v_thread_id, v_my_name, v_my_avatar, is_anonymous)
    RETURNING id INTO v_my_identity_id;

    INSERT INTO public.chat_identities (thread_id, display_name, avatar_url, is_anonymous)
    VALUES (v_thread_id, v_other_name, v_other_avatar, false)
    RETURNING id INTO v_other_identity_id;

    -- 4. Create Links (Bridge)
    INSERT INTO public.chat_participants (thread_id, user_id, identity_id)
    VALUES (v_thread_id, auth.uid(), v_my_identity_id);

    INSERT INTO public.chat_participants (thread_id, user_id, identity_id)
    VALUES (v_thread_id, recipient_id, v_other_identity_id);

    RETURN v_thread_id;
END;
$$;

-- 2. Send Message (RPC)
CREATE OR REPLACE FUNCTION send_secure_message(
    p_thread_id UUID,
    p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_identity_id UUID;
    v_msg_id UUID;
BEGIN
    -- Find MY identity in this thread
    SELECT identity_id INTO v_identity_id
    FROM public.chat_participants
    WHERE thread_id = p_thread_id AND user_id = auth.uid();

    IF v_identity_id IS NULL THEN
        RAISE EXCEPTION 'You are not a participant in this thread';
    END IF;

    -- Insert Message linked to IDENTITY
    INSERT INTO public.chat_messages (thread_id, sender_identity_id, content)
    VALUES (p_thread_id, v_identity_id, p_content)
    RETURNING id INTO v_msg_id;

    -- Update thread timestamp
    UPDATE public.chat_threads SET updated_at = now() WHERE id = p_thread_id;

    RETURN v_msg_id;
END;
$$;
