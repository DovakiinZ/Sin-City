import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Debug logging
console.log('Environment check:', {
    hasUrl: !!url,
    urlValue: url ? `${url.substring(0, 20)}...` : 'undefined',
    urlLength: url?.length,
    hasAnon: !!anon,
    anonLength: anon?.length,
    env: import.meta.env.MODE,
    allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
});

// Validate URL format
const isValidUrl = (str: string | undefined): boolean => {
    if (!str) return false;
    try {
        const parsed = new URL(str.trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

if (!url || !isValidUrl(url)) {
    console.error("Supabase URL issue!", {
        url: url,
        isValid: isValidUrl(url)
    });
    throw new Error(`VITE_SUPABASE_URL is invalid. Got: "${url}". Please check your .env file.`);
}

if (!anon) {
    throw new Error("VITE_SUPABASE_ANON_KEY is not defined. Please check your environment variables.");
}

// Trim any whitespace
const supabaseUrl = url.trim();
const supabaseAnonKey = anon.trim();

console.log('Supabase client config:', {
    mode: import.meta.env.MODE,
    url: supabaseUrl
});

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

