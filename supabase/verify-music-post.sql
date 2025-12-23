-- VERIFICATION SCRIPT: Create a test post with music
-- This bypasses the frontend form to test if the DB and Display are working.

INSERT INTO public.posts (
    title,
    content,
    type,
    user_id,
    attachments,
    created_at
)
VALUES (
    'Music System Check',
    'This is a generated test post to verify if music attachments are working correctly in the database.',
    'Image', -- Using 'Image' type as container, but attachments handle the content
    auth.uid(), -- Will be null if run from editor without user context, which is fine for public posts if RLS allows
    '[{"url": "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "type": "music", "name": "Never Gonna Give You Up"}]'::jsonb,
    NOW()
);
