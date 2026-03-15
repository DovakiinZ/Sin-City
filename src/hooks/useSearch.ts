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

/**
 * Fetch popular posts (most viewed/liked)
 * Replaced RPC call with standard query
 */
export async function getPopularPosts(limit = 5): Promise<PopularPost[]> {
    try {
        const { data, error } = await supabase
            .from("posts")
            .select("id, title, view_count, created_at, comments(count), reactions(count)")
            .or("hidden.is.null,hidden.eq.false") // Filter out hidden posts
            .order("view_count", { ascending: false })
            .limit(limit);

        if (error) throw error;

        // Transform data
        return (data || []).map((post: any) => ({
            id: post.id,
            title: post.title,
            view_count: post.view_count || 0,
            comment_count: post.comments?.[0]?.count || 0,
            reaction_count: post.reactions?.[0]?.count || 0,
            created_at: post.created_at,
        }));
    } catch (error) {
        console.error("Error fetching popular posts:", error);
        return [];
    }
}

export interface TrendingPost extends PopularPost {
    trend_score: number;
}

/**
 * Fetch trending posts (recent posts)
 * Replaced RPC call with standard query
 */
export async function getTrendingPosts(days = 7, limit = 5): Promise<TrendingPost[]> {
    try {
        // Simple trending: Recent posts
        const { data, error } = await supabase
            .from("posts")
            .select("id, title, view_count, created_at, comments(count), reactions(count)")
            .or("hidden.is.null,hidden.eq.false") // Filter out hidden posts
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) throw error;

        // Transform data
        return (data || []).map((post: any) => ({
            id: post.id,
            title: post.title,
            view_count: post.view_count || 0,
            comment_count: post.comments?.[0]?.count || 0,
            reaction_count: post.reactions?.[0]?.count || 0,
            created_at: post.created_at,
            trend_score: 0 // Placeholder
        }));

    } catch (error) {
        console.error("Error fetching trending posts:", error);
        return [];
    }
}

export interface TagCount {
    tag: string;
    count: number;
}

export async function getAllTags(): Promise<TagCount[]> {
    try {
        // Tag extraction from posts query
        const { data, error } = await supabase
            .from("posts")
            .select("tags")
            .not("tags", "is", null)
            .limit(100); // Limit for safety

        if (error) throw error;

        const tagMap = new Map<string, number>();

        data?.forEach((post: any) => {
            if (Array.isArray(post.tags)) {
                post.tags.forEach((tag: string) => {
                    const normalized = tag.toLowerCase().trim();
                    if (normalized) {
                        tagMap.set(normalized, (tagMap.get(normalized) || 0) + 1);
                    }
                });
            }
        });

        return Array.from(tagMap.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);

    } catch (error) {
        console.error("Error fetching tags:", error);
        return [];
    }
}
