import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Post {
    id: string;
    user_id?: string;
    title: string;
    type: "Text" | "Image" | "Video" | "Link";
    content?: string;
    slug?: string;
    attachments?: unknown;
    tags?: string[];
    draft?: boolean;
    author_name?: string;
    author_email?: string;
    view_count?: number;
    created_at: string;
    updated_at: string;
}

export function useSupabasePosts() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let channel: RealtimeChannel;

        const fetchPosts = async () => {
            try {
                setLoading(true);
                const { data, error: fetchError } = await supabase
                    .from("posts")
                    .select("*")
                    .or("hidden.is.null,hidden.eq.false") // Filter out hidden posts
                    .order("created_at", { ascending: false });

                if (fetchError) throw fetchError;
                setPosts(data || []);
                setError(null);
            } catch (err) {
                console.error("Error fetching posts:", err);
                setError(err instanceof Error ? err.message : "Failed to fetch posts");
            } finally {
                setLoading(false);
            }
        };

        const setupRealtimeSubscription = () => {
            channel = supabase
                .channel("posts-changes")
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "posts",
                    },
                    (payload) => {
                        console.log("New post:", payload.new);
                        setPosts((current) => [payload.new as Post, ...current]);
                    }
                )
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "posts",
                    },
                    (payload) => {
                        console.log("Updated post:", payload.new);
                        setPosts((current) =>
                            current.map((post) =>
                                post.id === payload.new.id ? (payload.new as Post) : post
                            )
                        );
                    }
                )
                .on(
                    "postgres_changes",
                    {
                        event: "DELETE",
                        schema: "public",
                        table: "posts",
                    },
                    (payload) => {
                        console.log("Deleted post:", payload.old);
                        setPosts((current) =>
                            current.filter((post) => post.id !== payload.old.id)
                        );
                    }
                )
                .subscribe();
        };

        fetchPosts();
        setupRealtimeSubscription();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, []);

    return { posts, loading, error };
}

export async function createPost(post: Omit<Post, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
        .from("posts")
        .insert([post])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updatePost(id: string, updates: Partial<Post>) {
    const { data, error } = await supabase
        .from("posts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deletePost(id: string) {
    const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", id);

    if (error) throw error;
}
