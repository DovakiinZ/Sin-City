import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Comment {
    id: string;
    post_id: string;
    user_id?: string;
    guest_id?: string;
    parent_id?: string | null;
    author_name: string;
    author_username?: string;
    author_avatar?: string;
    content: string;
    gif_url?: string;
    created_at: string;
    updated_at: string;
    replies?: Comment[];
}

export function useComments(postId: string) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchComments = async () => {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from("comments")
                .select("*")
                .eq("post_id", postId)
                .order("created_at", { ascending: true });

            if (fetchError) throw fetchError;

            // Get unique user IDs to fetch avatars
            const userIds = [...new Set((data || []).map(c => c.user_id).filter(Boolean))];

            // Fetch avatars and usernames for all users in one query
            let userMap: Record<string, { avatar_url?: string; username?: string }> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, avatar_url, username")
                    .in("id", userIds);

                if (profiles) {
                    userMap = profiles.reduce((acc: Record<string, any>, p) => {
                        acc[p.id] = { avatar_url: p.avatar_url, username: p.username };
                        return acc;
                    }, {});
                }
            }

            // Map comments with avatars and usernames
            const mappedComments = (data || []).map((comment: any) => ({
                ...comment,
                author_avatar: comment.user_id ? userMap[comment.user_id]?.avatar_url : undefined,
                author_username: comment.user_id ? userMap[comment.user_id]?.username : undefined,
            }));

            setComments(mappedComments);
            setError(null);
        } catch (err) {
            console.error("Error fetching comments:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch comments");
        } finally {
            setLoading(false);
        }
    };

    // Optimistic add - shows comment immediately before API responds
    const optimisticAddComment = (comment: Omit<Comment, "id" | "created_at" | "updated_at">) => {
        const optimisticComment: Comment = {
            ...comment,
            id: `temp-${Date.now()}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setComments(current => [...current, optimisticComment]);
        return optimisticComment.id;
    };

    // Remove optimistic comment (on error)
    const removeOptimisticComment = (tempId: string) => {
        setComments(current => current.filter(c => c.id !== tempId));
    };

    useEffect(() => {
        let channel: RealtimeChannel;

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
                        setComments((current) => {
                            // Check if this is replacing an optimistic comment
                            const hasTempVersion = current.some(c =>
                                c.id.startsWith('temp-') &&
                                ((c.user_id && c.user_id === payload.new.user_id) || (c.guest_id && c.guest_id === payload.new.guest_id)) &&
                                c.content === payload.new.content
                            );
                            if (hasTempVersion) {
                                // Replace temp with real
                                return current.map(c =>
                                    c.id.startsWith('temp-') && ((c.user_id && c.user_id === payload.new.user_id) || (c.guest_id && c.guest_id === payload.new.guest_id)) && c.content === payload.new.content
                                        ? payload.new as Comment
                                        : c
                                );
                            }
                            return [...current, payload.new as Comment];
                        });
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

    return { comments, loading, error, optimisticAddComment, removeOptimisticComment, refetch: fetchComments };
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

        let commenterUsername = null;
        if (comment.user_id) {
            // Get commenter's profile to ensure we have the username
            const { data: commenterProfile } = await supabase
                .from("profiles")
                .select("username")
                .eq("id", comment.user_id)
                .single();
            commenterUsername = commenterProfile?.username;
        }

        // Send notification (including for self-comments as requested)
        if (post?.user_id) {
            console.log('[createComment] Creating notification for user:', post.user_id, 'from commenter:', comment.user_id || comment.guest_id);
            const { error: notifError } = await supabase.from("notifications").insert([{
                user_id: post.user_id,
                type: "comment",
                content: {
                    author: comment.author_name,
                    likerId: comment.user_id,
                    guestId: comment.guest_id, // Add guest ID tracking in notification
                    likerUsername: commenterUsername,
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
                if (username.toLowerCase() === commenterUsername?.toLowerCase()) continue;

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
                            likerUsername: commenterUsername,
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
