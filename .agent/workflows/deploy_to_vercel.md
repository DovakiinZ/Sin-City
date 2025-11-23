---
description: How to deploy the Sin City application to Vercel
---

# Deploying Sin City to Vercel

This guide outlines the steps to deploy your React + Vite + Supabase application to Vercel.

## Prerequisites

1.  A [GitHub](https://github.com/) account.
2.  A [Vercel](https://vercel.com/) account.
3.  Your Supabase project URL and Anon Key.

## Step 1: Push to GitHub

Ensure your latest code is pushed to a GitHub repository.

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

## Step 2: Import to Vercel

1.  Log in to your Vercel dashboard.
2.  Click **"Add New..."** -> **"Project"**.
3.  Select your GitHub repository (`Sin-City`).
4.  Vercel will automatically detect it's a **Vite** project.

## Step 3: Configure Environment Variables

**CRITICAL:** You must add your Supabase environment variables for the app to work in production.

In the "Environment Variables" section of the deployment screen, add:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL (e.g., `https://xyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase Anon/Public Key |

*You can find these in your local `.env` file or Supabase Dashboard -> Settings -> API.*

## Step 4: Deploy

1.  Click **"Deploy"**.
2.  Wait for the build to complete (usually < 1 minute).
3.  Once finished, Vercel will give you a live URL (e.g., `https://sin-city.vercel.app`).

## Step 5: Update Supabase Auth Settings

1.  Go to your **Supabase Dashboard** -> **Authentication** -> **URL Configuration**.
2.  Add your new Vercel URL to **Site URL** and **Redirect URLs**.
    *   Example: `https://sin-city.vercel.app/**`
3.  Save changes.

## Verification

Visit your new URL. The app should load, and you should be able to log in and fetch posts.
