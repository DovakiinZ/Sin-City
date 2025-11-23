import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface SearchResult {
    id: string;
    title: string;
    content: string;
    author_name: string;
    created_at: string;
    rank: number;
}

export function useSearch(query: string, enabled: boolean = true) {
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled || !query.trim()) {
            setResults([]);
            return;
        }

        const searchPosts = async () => {
            try {
                setLoading(true);
                setError(null);

                const { data, error: searchError } = await supabase.rpc("search_posts", {
                    search_query: query.trim(),
                });

                if (searchError) throw searchError;
                setResults(data || []);
            } catch (err) {
                console.error("Search error:", err);
                setError(err instanceof Error ? err.message : "Search failed");
                setResults([]);
            } finally {
                setLoading(false);
            }
        };

        // Debounce search
        const timeoutId = setTimeout(searchPosts, 300);
        return () => clearTimeout(timeoutId);
    }, [query, enabled]);

    return { results, loading, error };
}

export interface PopularPost {
    id: string;
    title: string;
    view_count: number;
    comment_count: number;
    reaction_count: number;
    created_at: string;
}

export async function getPopularPosts(limit: number = 10): Promise<PopularPost[]> {
    const { data, error } = await supabase.rpc("get_popular_posts", {
        limit_count: limit,
    });

    if (error) throw error;
    return data || [];
}

export interface TrendingPost extends PopularPost {
    score: number;
}

export async function getTrendingPosts(
    daysBack: number = 7,
    limit: number = 10
): Promise<TrendingPost[]> {
    const { data, error } = await supabase.rpc("get_trending_posts", {
        days_back: daysBack,
        limit_count: limit,
    });

    if (error) throw error;
    return data || [];
}

export interface TagCount {
    tag: string;
    count: number;
}

export async function getAllTags(): Promise<TagCount[]> {
    const { data, error } = await supabase.rpc("get_all_tags");

    if (error) throw error;
    return data || [];
}
