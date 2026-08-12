import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

/**
 * Follow state between the current user and a target user.
 *
 * A follow is a *request* until the target approves it:
 *   none     - no relationship
 *   pending  - request sent, waiting on the target
 *   accepted - approved
 */
export type FollowStatus = "none" | "pending" | "accepted";

interface FollowRow {
    follower_id: string;
    following_id: string;
    status: FollowStatus;
}

export function useFollow(targetUserId?: string) {
    const { user } = useAuth();

    // Me -> them
    const [outgoing, setOutgoing] = useState<FollowStatus>("none");
    // Them -> me
    const [incoming, setIncoming] = useState<FollowStatus>("none");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    // DMs unlock when an approved follow exists in either direction.
    const canDM = outgoing === "accepted" || incoming === "accepted";

    const refresh = useCallback(async () => {
        if (!user?.id || !targetUserId || user.id === targetUserId) {
            setOutgoing("none");
            setIncoming("none");
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from("follows")
                .select("follower_id, following_id, status")
                .or(
                    `and(follower_id.eq.${user.id},following_id.eq.${targetUserId}),` +
                    `and(follower_id.eq.${targetUserId},following_id.eq.${user.id})`
                );

            if (error) throw error;

            const rows = (data || []) as FollowRow[];
            const out = rows.find(r => r.follower_id === user.id);
            const inc = rows.find(r => r.follower_id === targetUserId);

            setOutgoing(out ? out.status : "none");
            setIncoming(inc ? inc.status : "none");
        } catch (err) {
            console.error("Error loading follow status:", err);
            setOutgoing("none");
            setIncoming("none");
        } finally {
            setLoading(false);
        }
    }, [user?.id, targetUserId]);

    useEffect(() => {
        setLoading(true);
        refresh();
    }, [refresh]);

    /** Send a follow request. It stays pending until the target approves. */
    const requestFollow = useCallback(async (): Promise<boolean> => {
        if (!user?.id || !targetUserId) return false;
        setBusy(true);

        try {
            const { error } = await supabase
                .from("follows")
                .insert({ follower_id: user.id, following_id: targetUserId, status: "pending" });

            if (error) throw error;
            setOutgoing("pending");

            const { data: me } = await supabase
                .from("profiles")
                .select("username")
                .eq("id", user.id)
                .single();

            await supabase.from("notifications").insert({
                user_id: targetUserId,
                type: "follow_request",
                content: {
                    follower: me?.username || "Someone",
                    followerId: user.id,
                    followerUsername: me?.username,
                },
                read: false,
            });

            return true;
        } catch (err) {
            console.error("Error sending follow request:", err);
            return false;
        } finally {
            setBusy(false);
        }
    }, [user?.id, targetUserId]);

    /** Cancel a pending request, or unfollow after approval. */
    const unfollow = useCallback(async (): Promise<boolean> => {
        if (!user?.id || !targetUserId) return false;
        setBusy(true);

        try {
            const { error } = await supabase
                .from("follows")
                .delete()
                .eq("follower_id", user.id)
                .eq("following_id", targetUserId);

            if (error) throw error;
            setOutgoing("none");
            return true;
        } catch (err) {
            console.error("Error unfollowing:", err);
            return false;
        } finally {
            setBusy(false);
        }
    }, [user?.id, targetUserId]);

    /** Approve or reject this user's request to follow me. */
    const respondToRequest = useCallback(async (approve: boolean): Promise<boolean> => {
        if (!user?.id || !targetUserId) return false;
        setBusy(true);

        try {
            const { error } = await supabase.rpc("respond_to_follow_request", {
                p_follower_id: targetUserId,
                p_approve: approve,
            });

            if (error) throw error;
            setIncoming(approve ? "accepted" : "none");
            return true;
        } catch (err) {
            console.error("Error responding to follow request:", err);
            return false;
        } finally {
            setBusy(false);
        }
    }, [user?.id, targetUserId]);

    return {
        outgoing,
        incoming,
        canDM,
        loading,
        busy,
        refresh,
        requestFollow,
        unfollow,
        respondToRequest,
    };
}

export interface PendingFollowRequest {
    follower_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    requested_at: string;
}

/** Incoming follow requests awaiting the current user's decision. */
export function usePendingFollowRequests() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<PendingFollowRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!user?.id) {
            setRequests([]);
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase.rpc("get_pending_follow_requests");
            if (error) throw error;
            setRequests((data || []) as PendingFollowRequest[]);
        } catch (err) {
            console.error("Error loading follow requests:", err);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const respond = useCallback(async (followerId: string, approve: boolean) => {
        // Optimistic - the row leaves the pending list either way.
        setRequests(prev => prev.filter(r => r.follower_id !== followerId));

        const { error } = await supabase.rpc("respond_to_follow_request", {
            p_follower_id: followerId,
            p_approve: approve,
        });

        if (error) {
            console.error("Error responding to follow request:", error);
            refresh();
            return false;
        }
        return true;
    }, [refresh]);

    return { requests, loading, refresh, respond };
}
