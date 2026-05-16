-- Create Polls Table
CREATE TABLE IF NOT EXISTS public.post_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Poll Options Table
CREATE TABLE IF NOT EXISTS public.post_poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.post_polls(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Poll Votes Table
CREATE TABLE IF NOT EXISTS public.post_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.post_polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES public.post_poll_options(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Ensure one vote per user per poll
    UNIQUE(poll_id, user_id)
);

-- RLS Policies
ALTER TABLE public.post_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_poll_votes ENABLE ROW LEVEL SECURITY;

-- Post Polls Policies
CREATE POLICY "Anyone can read polls" ON public.post_polls FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert polls" ON public.post_polls FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Anonymous users can insert polls" ON public.post_polls FOR INSERT WITH CHECK (auth.role() = 'anon');

-- Post Poll Options Policies
CREATE POLICY "Anyone can read poll options" ON public.post_poll_options FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert poll options" ON public.post_poll_options FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Anonymous users can insert poll options" ON public.post_poll_options FOR INSERT WITH CHECK (auth.role() = 'anon');

-- Post Poll Votes Policies
CREATE POLICY "Anyone can read poll votes" ON public.post_poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can vote once" ON public.post_poll_votes FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND auth.uid() = user_id
);
CREATE POLICY "Users can change their vote" ON public.post_poll_votes FOR DELETE USING (
    auth.role() = 'authenticated' AND auth.uid() = user_id
);
