import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Bookmark {
    id: string;
    user_id: string;
    post_id: string;
    created_at: string;
}

export function useBookmarks(userId: string | undefined) {
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setBookmarks([]);
            setLoading(false);
            return;
        }

        let channel: RealtimeChannel;

        const fetchBookmarks = async () => {
            try {
                setLoading(true);
                const { data, error: fetchError } = await supabase
                    .from("bookmarks")
                    .select("*")
                    .eq("user_id", userId)
                    .order("created_at", { ascending: false });

                if (fetchError) throw fetchError;
                setBookmarks(data || []);
                setError(null);
            } catch (err) {
                console.error("Error fetching bookmarks:", err);
                setError(err instanceof Error ? err.message : "Failed to fetch bookmarks");
            } finally {
                setLoading(false);
            }
        };

        const setupRealtimeSubscription = () => {
            channel = supabase
                .channel(`bookmarks-${userId}`)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "bookmarks",
                        filter: `user_id=eq.${userId}`,
                    },
                    (payload) => {
                        setBookmarks((current) => [payload.new as Bookmark, ...current]);
                    }
                )
                .on(
                    "postgres_changes",
                    {
                        event: "DELETE",
                        schema: "public",
                        table: "bookmarks",
                        filter: `user_id=eq.${userId}`,
                    },
                    (payload) => {
                        setBookmarks((current) =>
                            current.filter((b) => b.id !== payload.old.id)
                        );
                    }
                )
                .subscribe();
        };

        fetchBookmarks();
        setupRealtimeSubscription();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [userId]);

    return { bookmarks, loading, error };
}

export async function toggleBookmark(userId: string, postId: string) {
    // Check if bookmark exists
    const { data: existing } = await supabase
        .from("bookmarks")
        .select("id")
        .eq("user_id", userId)
        .eq("post_id", postId)
        .single();

    if (existing) {
        // Remove bookmark
        const { error } = await supabase
            .from("bookmarks")
            .delete()
            .eq("id", existing.id);

        if (error) throw error;
        return { action: "removed" };
    } else {
        // Add bookmark
        const { data, error } = await supabase
            .from("bookmarks")
            .insert([{ user_id: userId, post_id: postId }])
            .select()
            .single();

        if (error) throw error;
        return { action: "added", data };
    }
}

export async function isBookmarked(userId: string, postId: string): Promise<boolean> {
    const { data } = await supabase
        .from("bookmarks")
        .select("id")
        .eq("user_id", userId)
        .eq("post_id", postId)
        .single();

    return !!data;
}
