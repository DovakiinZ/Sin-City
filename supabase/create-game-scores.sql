-- Create the game_scores table
CREATE TABLE IF NOT EXISTS public.game_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    game_name TEXT NOT NULL CHECK (game_name IN ('snake', 'tetris', 'pacman')),
    score INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view all scores (needed for leaderboards)
CREATE POLICY "Scores are viewable by everyone" 
ON public.game_scores FOR SELECT 
USING (true);

-- Policy: Users can insert their own scores
CREATE POLICY "Users can insert their own scores" 
ON public.game_scores FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create indexes for faster leaderboard queries
CREATE INDEX IF NOT EXISTS game_scores_game_score_idx ON public.game_scores(game_name, score DESC);
CREATE INDEX IF NOT EXISTS game_scores_user_id_idx ON public.game_scores(user_id);
