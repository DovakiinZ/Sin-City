-- VERIFICATION SCRIPT: Create a test post with YouTube Music
-- This tests two types of YouTube links (Standard and Short)

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
    'YouTube System Check 1 (Standard)',
    'Testing standard watch URL',
    'Image',
    auth.uid(),
    '[{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "type": "music", "name": "Rick Roll"}]'::jsonb,
    NOW()
),
(
    'YouTube System Check 2 (Short)',
    'Testing youtu.be short URL',
    'Image',
    auth.uid(),
    '[{"url": "https://youtu.be/dQw4w9WgXcQ", "type": "music", "name": "Rick Roll Short"}]'::jsonb,
    NOW() - INTERVAL '1 minute'
);
