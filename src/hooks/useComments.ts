import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Comment {
    id: string;
    post_id: string;
    user_id?: string;
    author_name: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export function useComments(postId: string) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let channel: RealtimeChannel;

        const fetchComments = async () => {
            try {
                setLoading(true);
                const { data, error: fetchError } = await supabase
                    .from("comments")
                    .select("*")
                    .eq("post_id", postId)
                    .order("created_at", { ascending: true });

                if (fetchError) throw fetchError;
                setComments(data || []);
                setError(null);
            } catch (err) {
                console.error("Error fetching comments:", err);
                setError(err instanceof Error ? err.message : "Failed to fetch comments");
            } finally {
                setLoading(false);
            }
        };

        const setupRealtimeSubscription = () => {
            channel = supabase
                .channel(`comments-${postId}`)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "comments",
                        filter: `post_id=eq.${postId}`,
                    },
                    (payload) => {
                        setComments((current) => [...current, payload.new as Comment]);
                    }
                )
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "comments",
                        filter: `post_id=eq.${postId}`,
                    },
                    (payload) => {
                        setComments((current) =>
                            current.map((comment) =>
                                comment.id === payload.new.id ? (payload.new as Comment) : comment
                            )
                        );
                    }
                )
                .on(
                    "postgres_changes",
                    {
                        event: "DELETE",
                        schema: "public",
                        table: "comments",
                        filter: `post_id=eq.${postId}`,
                    },
                    (payload) => {
                        setComments((current) =>
                            current.filter((comment) => comment.id !== payload.old.id)
                        );
                    }
                )
                .subscribe();
        };

        fetchComments();
        setupRealtimeSubscription();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [postId]);

    return { comments, loading, error };
}

export async function createComment(comment: Omit<Comment, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
        .from("comments")
        .insert([comment])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateComment(id: string, content: string) {
    const { data, error } = await supabase
        .from("comments")
        .update({ content })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteComment(id: string) {
    const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", id);

    if (error) throw error;
}
