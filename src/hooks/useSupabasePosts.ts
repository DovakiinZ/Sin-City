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
    hidden?: boolean;
    is_pinned?: boolean;
    author_name?: string;
    author_email?: string;
    author_avatar?: string;
    author_username?: string;
    view_count?: number;
    thread_id?: string;
    thread_position?: number;
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
                // Fetch posts without the join first to avoid FK errors
                // Only show first post of threads (thread_position = 1) or standalone posts
                const { data: postsData, error: fetchError } = await supabase
                    .from("posts")
                    .select("*")
                    .or("hidden.is.null,hidden.eq.false") // Filter out hidden posts
                    .or("thread_position.is.null,thread_position.eq.1") // Only first post of threads
                    .order("is_pinned", { ascending: false, nullsFirst: false })
                    .order("created_at", { ascending: false });

                if (fetchError) throw fetchError;

                // Collect user IDs to fetch profiles
                const userIds = [...new Set((postsData || []).map((p: any) => p.user_id).filter(Boolean))];

                // Collect author names that might need matching
                const authorNames = [...new Set((postsData || [])
                    .filter((p: any) => !p.user_id && p.author_name)
                    .map((p: any) => p.author_name.toLowerCase()))];

                let profilesMap = new Map();
                let profilesByDisplayName = new Map();

                // Only fetch profiles we need - by user_id or by matching author_name
                if (userIds.length > 0) {
                    const { data: userProfiles } = await supabase
                        .from('profiles')
                        .select('id, username, display_name, avatar_url')
                        .in('id', userIds);

                    if (userProfiles) {
                        userProfiles.forEach(p => {
                            profilesMap.set(p.id, p);
                        });
                    }
                }

                // If there are orphaned posts (no user_id), try to match by display_name
                if (authorNames.length > 0) {
                    const { data: matchedProfiles } = await supabase
                        .from('profiles')
                        .select('id, username, display_name, avatar_url')
                        .or(authorNames.map(n => `display_name.ilike.${n},username.ilike.${n}`).join(','));

                    if (matchedProfiles) {
                        matchedProfiles.forEach(p => {
                            if (p.display_name) {
                                profilesByDisplayName.set(p.display_name.toLowerCase(), p);
                            }
                            if (p.username) {
                                profilesByDisplayName.set(p.username.toLowerCase(), p);
                            }
                        });
                    }
                }

                // Map the data to include author_avatar and author_username
                const postsWithAvatars = (postsData || []).map((post: any) => {
                    // First try to find profile by user_id
                    let profile = profilesMap.get(post.user_id);

                    // If no profile found by user_id, try by author_name (display_name)
                    if (!profile && post.author_name) {
                        profile = profilesByDisplayName.get(post.author_name.toLowerCase());
                    }

                    return {
                        ...post,
                        author_avatar: profile?.avatar_url || post.author_avatar || null,
                        author_username: profile?.username || null,
                        // Overwrite author_name with proper username if available
                        author_name: profile?.username || post.author_name || "Anonymous",
                    };
                });

                setPosts(postsWithAvatars);
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

// Thread-related types
export interface ThreadPost {
    title: string;
    content: string;
    attachments?: unknown;
    tags?: string[];
}

// Create a thread (multiple connected posts)
export async function createThread(
    posts: ThreadPost[],
    authorInfo: {
        user_id?: string;
        author_name: string;
        author_email?: string;
    }
) {
    if (posts.length === 0) throw new Error("Thread must have at least one post");

    // Generate a unique thread_id
    const threadId = crypto.randomUUID();

    // Create all posts with thread info
    const postsToInsert = posts.map((post, index) => ({
        title: post.title,
        type: post.attachments ? "Image" as const : "Text" as const,
        content: post.content,
        attachments: post.attachments || null,
        tags: post.tags || null,
        draft: false,
        thread_id: threadId,
        thread_position: index + 1,
        user_id: authorInfo.user_id || null,
        author_name: authorInfo.author_name,
        author_email: authorInfo.author_email || "",
    }));

    const { data, error } = await supabase
        .from("posts")
        .insert(postsToInsert)
        .select();

    if (error) throw error;
    return { threadId, posts: data };
}

// Get all posts in a thread
export async function getThreadPosts(threadId: string): Promise<Post[]> {
    const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("thread_id", threadId)
        .order("thread_position", { ascending: true });

    if (error) throw error;
    return data || [];
}

// Get thread info for a post (if it belongs to a thread)
export async function getThreadInfo(postId: string): Promise<{ threadId: string; position: number; total: number } | null> {
    // First get the post's thread info
    const { data: post, error } = await supabase
        .from("posts")
        .select("thread_id, thread_position")
        .eq("id", postId)
        .single();

    if (error || !post?.thread_id) return null;

    // Get total posts in thread
    const { count } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("thread_id", post.thread_id);

    return {
        threadId: post.thread_id,
        position: post.thread_position,
        total: count || 0
    };
}
