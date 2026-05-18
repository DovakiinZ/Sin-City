-- VERIFICATION SCRIPT: Create a test post with music.youtube.com
-- This tests the specific domain user is using

INSERT INTO public.posts (
    title,
    content,
    type,
    user_id,
    attachments,
    created_at
)
VALUES 
(
    'YouTube Music System Check',
    'Testing music.youtube.com URL',
    'Image',
    auth.uid(),
    '[{"url": "https://music.youtube.com/watch?v=kJQP7kiw5Fk", "type": "music", "name": "Despacito (Music)"}]'::jsonb,
    NOW()
);
