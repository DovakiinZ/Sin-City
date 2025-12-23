import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export interface Conversation {
    id: string;
    participant_1: string;
    participant_2: string;
    status: 'pending' | 'accepted' | 'rejected' | 'blocked';
    initiated_by: string | null;
    last_message_at: string;
    created_at: string;
    // Joined data
    other_user?: {
        id: string;
        username: string | null;
        avatar_url: string | null;
    };
    last_message?: {
        content: string | null;
        sender_id: string;
        created_at: string;
    };
    unread_count?: number;
    is_request_to_me?: boolean; // True if I need to accept this request
}

export function useConversations() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [requests, setRequests] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalUnread, setTotalUnread] = useState(0);

    const loadConversations = useCallback(async () => {
        if (!user) {
            setConversations([]);
            setRequests([]);
            setTotalUnread(0);
            setLoading(false);
            return;
        }

        try {
            // Get all conversations for this user (excluding blocked)
            const { data: convos, error } = await supabase
                .from("conversations")
                .select("*")
                .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
                .neq("status", "blocked")
                .order("last_message_at", { ascending: false });

            if (error) throw error;

            if (!convos || convos.length === 0) {
                setConversations([]);
                setRequests([]);
                setTotalUnread(0);
                setLoading(false);
                return;
            }

            // Enrich conversations with user data
            const enrichedConversations = await Promise.all(
                convos.map(async (convo) => {
                    const otherUserId = convo.participant_1 === user.id
                        ? convo.participant_2
                        : convo.participant_1;

                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("id, username, avatar_url")
                        .eq("id", otherUserId)
                        .single();

                    const { data: lastMsg } = await supabase
                        .from("messages")
                        .select("content, sender_id, created_at")
                        .eq("conversation_id", convo.id)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .single();

                    const { count: unreadCount } = await supabase
                        .from("messages")
                        .select("*", { count: "exact", head: true })
                        .eq("conversation_id", convo.id)
                        .neq("sender_id", user.id)
                        .is("read_at", null);

                    // Check if this is a request to me (they initiated, status is pending)
                    const isRequestToMe = convo.status === 'pending' && convo.initiated_by !== user.id;

                    return {
                        ...convo,
                        other_user: profile || undefined,
                        last_message: lastMsg || undefined,
                        unread_count: unreadCount || 0,
                        is_request_to_me: isRequestToMe,
                    };
                })
            );

            // Separate into requests and active conversations
            const activeConvos = enrichedConversations.filter(c => c.status === 'accepted');
            const pendingRequests = enrichedConversations.filter(c => c.status === 'pending');

            setConversations(activeConvos);
            setRequests(pendingRequests);
            setTotalUnread(
                activeConvos.reduce((sum, c) => sum + (c.unread_count || 0), 0) +
                pendingRequests.filter(r => r.is_request_to_me).length
            );
        } catch (error) {
            console.error("Error loading conversations:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const startConversation = async (otherUserId: string): Promise<string | null> => {
        if (!user) return null;

        try {
            // Check if conversation already exists
            const user1 = user.id < otherUserId ? user.id : otherUserId;
            const user2 = user.id < otherUserId ? otherUserId : user.id;

            const { data: existing } = await supabase
                .from("conversations")
                .select("id, status")
                .eq("participant_1", user1)
                .eq("participant_2", user2)
                .single();

            if (existing) {
                // If blocked, can't message
                if (existing.status === 'blocked') {
                    console.log("Cannot message: blocked");
                    return null;
                }
                return existing.id;
            }

            // Create new conversation as pending request
            const { data, error } = await supabase
                .from("conversations")
                .insert({
                    participant_1: user1,
                    participant_2: user2,
                    status: 'pending',
                    initiated_by: user.id,
                })
                .select("id")
                .single();

            if (error) throw error;

            loadConversations();
            return data?.id || null;
        } catch (error) {
            console.error("Error starting conversation:", error);
            return null;
        }
    };

    const acceptRequest = async (conversationId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const { error } = await supabase
                .from("conversations")
                .update({ status: 'accepted' })
                .eq("id", conversationId);

            if (error) throw error;
            loadConversations();
            return true;
        } catch (error) {
            console.error("Error accepting request:", error);
            return false;
        }
    };

    const rejectRequest = async (conversationId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const { error } = await supabase
                .from("conversations")
                .update({ status: 'rejected' })
                .eq("id", conversationId);

            if (error) throw error;
            loadConversations();
            return true;
        } catch (error) {
            console.error("Error rejecting request:", error);
            return false;
        }
    };

    const blockUser = async (conversationId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const { error } = await supabase
                .from("conversations")
                .update({ status: 'blocked' })
                .eq("id", conversationId);

            if (error) throw error;
            loadConversations();
            return true;
        } catch (error) {
            console.error("Error blocking user:", error);
            return false;
        }
    };

    useEffect(() => {
        loadConversations();

        if (!user) return;

        const channel = supabase
            .channel(`conversations:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages",
                },
                () => {
                    loadConversations();
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "conversations",
                },
                () => {
                    loadConversations();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, loadConversations]);

    return {
        conversations,
        requests,
        loading,
        totalUnread,
        startConversation,
        acceptRequest,
        rejectRequest,
        blockUser,
        refresh: loadConversations,
    };
}
