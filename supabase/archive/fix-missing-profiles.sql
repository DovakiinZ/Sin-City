-- =============================================
-- FIX: Sync missing users and auto-create profiles
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Ensure role column exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Step 2: Insert ALL missing users from auth.users into profiles
INSERT INTO profiles (id, username, role, created_at)
SELECT 
    u.id,
    COALESCE(
        u.raw_user_meta_data->>'displayName', 
        u.raw_user_meta_data->>'username',
        split_part(u.email, '@', 1)
    ) as username,
    'user' as role,
    u.created_at
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create or replace the trigger function for auto-creating profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, role, created_at)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'displayName', 
            NEW.raw_user_meta_data->>'username',
            split_part(NEW.email, '@', 1)
        ),
        'user',
        NEW.created_at
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Drop existing trigger if any, then create new one
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 5: Verify - show all users now in profiles
SELECT 
    p.id,
    p.username,
    p.role,
    p.created_at
FROM profiles p
ORDER BY p.created_at DESC;

-- Show counts to verify sync
SELECT 
    (SELECT COUNT(*) FROM auth.users) as auth_users_count,
    (SELECT COUNT(*) FROM profiles) as profiles_count;
