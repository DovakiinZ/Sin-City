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

// Use proxy in development to bypass CORS
const isDevelopment = import.meta.env.DEV;
const supabaseUrl = isDevelopment ? '/supabase-api' : url;

console.log('Supabase client config:', {
    mode: import.meta.env.MODE,
    isDev: isDevelopment,
    url: supabaseUrl,
    originalUrl: url
});

export const supabase: SupabaseClient = createClient(supabaseUrl, anon, {
    auth: {
        // Disable session persistence to fix data loading issues when authenticated
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true,
    },
});
