import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Reaction {
    id: string;
    post_id: string;
    user_id?: string;
    reaction_type: "like";
    created_at: string;
}

export interface ReactionCount {
    reaction_type: string;
    count: number;
}

export function useReactions(postId: string) {
    const [reactions, setReactions] = useState<Reaction[]>([]);
    const [counts, setCounts] = useState<ReactionCount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let channel: RealtimeChannel;

        const fetchReactions = async () => {
            try {
                setLoading(true);
                const { data, error: fetchError } = await supabase
                    .from("reactions")
                    .select("*")
                    .eq("post_id", postId);

                if (fetchError) throw fetchError;

                setReactions(data || []);
                updateCounts(data || []);
                setError(null);
            } catch (err) {
                console.error("Error fetching reactions:", err);
                setError(err instanceof Error ? err.message : "Failed to fetch reactions");
            } finally {
                setLoading(false);
            }
        };

        const updateCounts = (reactionList: Reaction[]) => {
            const countMap = new Map<string, number>();
            reactionList.forEach((r) => {
                countMap.set(r.reaction_type, (countMap.get(r.reaction_type) || 0) + 1);
            });

            const countsArray: ReactionCount[] = Array.from(countMap.entries()).map(
                ([reaction_type, count]) => ({ reaction_type, count })
            );
            setCounts(countsArray);
        };

        const setupRealtimeSubscription = () => {
            channel = supabase
                .channel(`reactions-${postId}`)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "reactions",
                        filter: `post_id=eq.${postId}`,
                    },
                    (payload) => {
                        setReactions((current) => {
                            const updated = [...current, payload.new as Reaction];
                            updateCounts(updated);
                            return updated;
                        });
                    }
                )
                .on(
                    "postgres_changes",
                    {
                        event: "DELETE",
                        schema: "public",
                        table: "reactions",
                        filter: `post_id=eq.${postId}`,
                    },
                    (payload) => {
                        setReactions((current) => {
                            const updated = current.filter((r) => r.id !== payload.old.id);
                            updateCounts(updated);
                            return updated;
                        });
                    }
                )
                .subscribe();
        };

        fetchReactions();
        setupRealtimeSubscription();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [postId]);

    return { reactions, counts, loading, error };
}

export async function toggleReaction(
    postId: string,
    userId: string,
    reactionType: "like" = "like"
) {
    // Check if reaction already exists
    const { data: existing } = await supabase
        .from("reactions")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .eq("reaction_type", reactionType)
        .maybeSingle();

    if (existing) {
        // Remove reaction
        const { error } = await supabase
            .from("reactions")
            .delete()
            .eq("id", existing.id);

        if (error) throw error;
        return { action: "removed" };
    } else {
        // Add reaction
        const { data, error } = await supabase
            .from("reactions")
            .insert([{ post_id: postId, user_id: userId, reaction_type: reactionType }])
            .select()
            .single();

        if (error) throw error;

        // Create notification for post owner
        try {
            // Get post details (owner and title)
            const { data: post } = await supabase
                .from("posts")
                .select("user_id, title, slug")
                .eq("id", postId)
                .single();

            // Get liker's profile
            const { data: likerProfile } = await supabase
                .from("profiles")
                .select("username, display_name")
                .eq("id", userId)
                .single();

            // Send notification (even for self-likes as requested)
            if (post?.user_id) {
                console.log('[toggleReaction] Creating notification for user:', post.user_id, 'from liker:', userId);
                const likerName = likerProfile?.display_name || likerProfile?.username || "Someone";

                const { error: notifError } = await supabase.from("notifications").insert([{
                    user_id: post.user_id,
                    type: "reaction", // FIXED: Changed from 'like' to 'reaction' to match DB constraint
                    content: {
                        author: likerName,
                        likerId: userId,
                        likerUsername: likerProfile?.username,
                        postTitle: post.title,
                        postSlug: postId,
                        reaction: "👍" // Added reaction emoji/text for the notification display
                    },
                    read: false,
                }]);

                if (notifError) {
                    console.error('[toggleReaction] Notification insert error:', notifError);
                } else {
                    console.log('[toggleReaction] Notification created successfully');
                }
            } else {
                console.log('[toggleReaction] No post owner found, skipping notification');
            }
        } catch (notifError) {
            // Don't throw - notification is secondary, the like was successful
            console.error("Error creating like notification:", notifError);
        }

        return { action: "added", data };
    }
}
