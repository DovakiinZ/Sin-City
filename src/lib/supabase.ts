import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Debug logging for production
if (!url || !anon) {
    console.error("Supabase configuration missing!", {
        hasUrl: !!url,
        hasAnon: !!anon,
        env: import.meta.env.MODE
    });
}

if (!url) {
    throw new Error("VITE_SUPABASE_URL is not defined. Please check your environment variables.");
}

if (!anon) {
    throw new Error("VITE_SUPABASE_ANON_KEY is not defined. Please check your environment variables.");
}

export const supabase: SupabaseClient = createClient(url, anon);
