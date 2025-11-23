# Supabase Database Setup Guide

## Quick Start

### 1. Run Database Schema

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy and paste the contents of `supabase/enhanced-schema.sql`
4. Click **Run**

### 2. Enable Real-time

1. In Supabase dashboard, go to **Database** > **Replication**
2. Find the `supabase_realtime` publication
3. Click **Edit**
4. Add these tables:
   - `public.posts`
   - `public.comments`
   - `public.reactions`
5. Save

Alternatively, run `supabase/enable-realtime.sql` in SQL Editor.

### 3. Configure Environment

Create `.env` file (copy from `.env.example`):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SHOW_DRAFTS=false
```

## Database Structure

### Tables

- **posts** - Blog posts with real-time updates
- **comments** - Post comments
- **reactions** - Post reactions (+1, !, *, #)

### Security

- Row Level Security (RLS) enabled on all tables
- Authenticated users can create/edit/delete their own content
- Everyone can read published posts
- Draft posts only visible to authors

## Testing Real-time

1. Open two browser tabs
2. Create a post in tab 1
3. Watch it appear in tab 2 instantly!

## Troubleshooting

**Posts not appearing?**
- Check Supabase URL and anon key in `.env`
- Verify schema was run successfully
- Check browser console for errors

**Real-time not working?**
- Verify real-time is enabled in Supabase dashboard
- Check that tables are added to `supabase_realtime` publication
- Refresh the page

**Permission errors?**
- Make sure you're logged in
- Verify RLS policies are set correctly
- Check user_id matches auth.uid()
