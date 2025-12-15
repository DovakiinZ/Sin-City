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

    // Create notification for post owner
    try {
        // Get post details (owner and title)
        const { data: post } = await supabase
            .from("posts")
            .select("user_id, title, slug")
            .eq("id", comment.post_id)
            .single();

        // Get commenter's profile to ensure we have the username
        const { data: commenterProfile } = await supabase
            .from("profiles")
            .select("username") // Removed display_name
            .eq("id", comment.user_id)
            .single();

        // Send notification (including for self-comments as requested)
        if (post?.user_id) {
            console.log('[createComment] Creating notification for user:', post.user_id, 'from commenter:', comment.user_id);
            const { error: notifError } = await supabase.from("notifications").insert([{
                user_id: post.user_id,
                type: "comment",
                content: {
                    author: comment.author_name,
                    likerId: comment.user_id, // Keeping field name for consistency, or standardizing content structure
                    likerUsername: commenterProfile?.username,
                    postTitle: post.title,
                    postSlug: comment.post_id,
                    commentId: data.id,
                    commentContent: comment.content.substring(0, 50) + (comment.content.length > 50 ? "..." : "")
                },
                read: false,
            }]);

            if (notifError) {
                console.error('[createComment] Notification insert error:', notifError);
            }
        }

        // Handle Mentions
        const { extractMentions } = await import("@/lib/mentions");
        const mentionedUsernames = extractMentions(comment.content);

        if (mentionedUsernames.length > 0) {
            console.log('[createComment] Found mentions:', mentionedUsernames);

            // Look up mentioned users
            // Note: In a larger app, we'd do a batch lookup (Array params), but loop is fine for small scale
            for (const username of mentionedUsernames) {
                // Skip if mentioning self
                if (username.toLowerCase() === commenterProfile?.username?.toLowerCase()) continue;

                const { data: mentionedUser } = await supabase
                    .from("profiles")
                    .select("id")
                    .ilike("username", username)
                    .limit(1)
                    .maybeSingle();

                if (mentionedUser) {
                    // Verify RLS or policies isn't duplicate if mentioned user IS post owner?
                    // It's technically a different notification type ("mentioned you" vs "commented on your post").
                    // Usually fine to send both, or client filters. Sending reference.

                    // Don't duplicate if mentions post owner and we just notified them? 
                    // Actually, "User commented on your post" AND "User mentioned you" is redundant if in same action.
                    // But typically "Mention" takes precedence or is seen as separate.
                    // I'll send it.

                    console.log('[createComment] Creating mention notification for:', username);
                    await supabase.from("notifications").insert([{
                        user_id: mentionedUser.id,
                        type: "mention",
                        content: {
                            author: comment.author_name,
                            likerId: comment.user_id,
                            likerUsername: commenterProfile?.username,
                            postTitle: post?.title || "a post",
                            postSlug: comment.post_id,
                            commentId: data.id,
                            commentContent: comment.content.substring(0, 50) + (comment.content.length > 50 ? "..." : "")
                        },
                        read: false,
                    }]);
                }
            }
        }

    } catch (notifError) {
        // Don't throw - notification is secondary
        console.error("Error creating comment notification:", notifError);
    }

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
