import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Post {
    id: string;
    user_id?: string;
    guest_id?: string; // For anonymous posts
    title: string;
    type: "Text" | "Image" | "Video" | "Link";
    content?: string;
    slug?: string;
    attachments?: unknown;
    gif_url?: string;
    music_metadata?: unknown; // Cached music metadata for fallback
    draft?: boolean;
    hidden?: boolean;
    is_pinned?: boolean;
    author_name?: string;
    author_email?: string;
    author_avatar?: string;
    author_username?: string;
    author_last_seen?: string;
    anonymous_id?: string; // Human-readable ANON-XXXX for admin view
    view_count?: number;
    thread_id?: string;
    thread_position?: number;
    is_registered_only?: boolean;
    is_deleted?: boolean;
    author_role?: string;
    authorDiscordId?: string;
    authorSpotifyStatus?: any;
    created_at: string;
    updated_at: string;
}

export interface PollData {
    question: string;
    options: string[];
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
                
                // Defense in depth: Check if user is authenticated
                const { data: { session } } = await supabase.auth.getSession();
                const isAuthenticated = !!session;

                // Fetch posts with guest information for admin view
                let query = supabase
                    .from("posts")
                    .select(`
                        *,
                        is_registered_only,
                        guests:guest_id (anonymous_id)
                    `)
                    .order("is_pinned", { ascending: false, nullsFirst: false })
                    .order("created_at", { ascending: false });

                // If NOT authenticated, only show public posts
                if (!isAuthenticated) {
                    query = query.eq("is_registered_only", false);
                }

                const { data: postsData, error: fetchError } = await query.limit(50);

                if (fetchError) throw fetchError;

                // Filter to only show first post of threads or standalone posts
                const filteredPosts = (postsData || []).filter((post: any) =>
                    post.thread_position === null ||
                    post.thread_position === undefined ||
                    post.thread_position === 1
                );

                // Collect user IDs to fetch profiles
                const userIds = [...new Set(filteredPosts.map((p: any) => p.user_id).filter(Boolean))];

                // Collect author names that might need matching
                const authorNames = [...new Set(filteredPosts
                    .filter((p: any) => !p.user_id && p.author_name)
                    .map((p: any) => p.author_name.toLowerCase()))];

                const profilesMap = new Map();
                const profilesByDisplayName = new Map();

                // Only fetch profiles we need - by user_id or by matching author_name
                if (userIds.length > 0) {
                    const { data: userProfiles } = await supabase
                        .from('profiles')
                        .select('id, username, display_name, avatar_url, last_seen, role')
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
                        .select('id, username, display_name, avatar_url, last_seen, role')
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
                const postsWithAvatars = filteredPosts.map((post: any) => {
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
                        author_last_seen: profile?.last_seen || null,
                        author_role: profile?.role || null,
                        // Overwrite author_name with proper username if available
                        author_name: profile?.username || post.author_name || "Anonymous",
                        // Include guest anonymous_id for admin display
                        anonymous_id: post.guests?.anonymous_id || null,
                        is_registered_only: post.is_registered_only || false,
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

export async function createPost(post: Omit<Post, "id" | "created_at" | "updated_at">, pollData?: PollData) {
    const { data, error } = await supabase
        .from("posts")
        .insert([post])
        .select()
        .single();

    if (error) throw error;
    
    if (pollData && pollData.question && pollData.options.length > 0) {
        console.log('[createPost] Inserting poll data:', JSON.stringify(pollData));
        console.log('[createPost] Post ID for poll:', data.id);
        try {
            // Insert poll
            const { data: poll, error: pollError } = await supabase
                .from("post_polls")
                .insert([{ post_id: data.id, question: pollData.question }])
                .select()
                .single();
                
            if (pollError) {
                console.error('[createPost] Poll insert error:', pollError);
                throw pollError;
            }
            console.log('[createPost] Poll created:', poll.id);
            
            // Insert options
            const optionsToInsert = pollData.options.map(text => ({
                poll_id: poll.id,
                text
            }));
            
            console.log('[createPost] Inserting options:', JSON.stringify(optionsToInsert));
            const { error: optionsError } = await supabase
                .from("post_poll_options")
                .insert(optionsToInsert);
                
            if (optionsError) {
                console.error('[createPost] Options insert error:', optionsError);
                throw optionsError;
            }
            console.log('[createPost] Poll options created successfully');
        } catch (pollErr) {
            console.error("Failed to create poll for post:", pollErr);
            // Re-throw so the caller can show an error to the user
            throw pollErr;
        }
    } else {
        console.log('[createPost] No poll data provided or invalid:', pollData);
    }
    
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

export async function deletePost(id: string, softDelete: boolean = true) {
    if (softDelete) {
        const { error } = await supabase
            .from("posts")
            .update({ is_deleted: true })
            .eq("id", id);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from("posts")
            .delete()
            .eq("id", id);
        if (error) throw error;
    }
}

// Thread-related types
export interface ThreadPost {
    title: string;
    content: string;
    attachments?: unknown;
}

// Create a thread (multiple connected posts)
export async function createThread(
    posts: ThreadPost[],
    authorInfo: {
        user_id?: string;
        guest_id?: string;
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
        draft: false,
        thread_id: threadId,
        thread_position: index + 1,
        user_id: authorInfo.user_id || null,
        guest_id: authorInfo.guest_id || null,
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

// Convert a comment/reply into a thread post
export async function replyAsThreadPost(
    parentPostId: string,
    content: string,
    authorInfo: { user_id?: string; guest_id?: string; author_name: string; author_email?: string }
) {
    // 1. Get parent post
    const { data: parent, error: parentError } = await supabase
        .from("posts")
        .select("thread_id, thread_position")
        .eq("id", parentPostId)
        .single();

    if (parentError) throw parentError;

    let threadId = parent.thread_id;

    // 2. If no thread_id, start a new thread
    if (!threadId) {
        threadId = crypto.randomUUID();
        // Update parent to be the start of the thread
        await updatePost(parentPostId, {
            thread_id: threadId,
            thread_position: 1
        });
    }

    // 3. Get next position
    // We can't just count because of potential deletions, so we get the max position
    const { data: maxPosPost } = await supabase
        .from("posts")
        .select("thread_position")
        .eq("thread_id", threadId)
        .order("thread_position", { ascending: false })
        .limit(1)
        .single();

    const nextPosition = (maxPosPost?.thread_position || 1) + 1;

    // 4. Create new post
    const newPost = {
        title: "", // Thread replies don't need titles
        type: "Text",
        content: content,
        author_name: authorInfo.author_name,
        author_email: authorInfo.author_email,
        user_id: authorInfo.user_id || null,
        guest_id: authorInfo.guest_id || null,
        thread_id: threadId,
        thread_position: nextPosition,
        draft: false
    };

    const { data, error } = await supabase
        .from("posts")
        .insert([newPost])
        .select()
        .single();

    if (error) throw error;
    return { data, threadId };
}
