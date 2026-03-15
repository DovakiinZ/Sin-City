import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

/**
 * Hook for tracking global unread message count across all conversations
 * Backend-authoritative with realtime updates
 */
export function useUnreadCount() {
    const { user } = useAuth();
    const [totalUnread, setTotalUnread] = useState(0);
    const [loading, setLoading] = useState(true);
    const activeSessionIdRef = useRef<string | null>(null);

    // Fetch unread count from backend
    const fetchUnreadCount = useCallback(async () => {
        if (!user) {
            setTotalUnread(0);
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase.rpc('get_global_unread_count');

            if (error) {
                console.error('Error fetching unread count:', error);
                return;
            }

            setTotalUnread(data || 0);
        } catch (error) {
            console.error('Unexpected error fetching unread count:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Set the active session (to prevent incrementing when user is viewing that conversation)
    const setActiveSession = useCallback((sessionId: string | null) => {
        activeSessionIdRef.current = sessionId;
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchUnreadCount();
    }, [fetchUnreadCount]);

    // Re-fetch on window focus (multi-device sync)
    useEffect(() => {
        const handleFocus = () => {
            fetchUnreadCount();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchUnreadCount();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchUnreadCount]);

    // Realtime subscription for new messages
    useEffect(() => {
        if (!user) return;

        // Subscribe to all new messages (not filtered by session)
        const channel = supabase
            .channel(`global-messages:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "session_messages",
                },
                async (payload) => {
                    const newMessage = payload.new;

                    // Don't increment for messages sent by current user
                    if (newMessage.sender_id === user.id) {
                        return;
                    }

                    // Don't increment if user is currently viewing that conversation
                    if (activeSessionIdRef.current === newMessage.session_id) {
                        return;
                    }

                    // Verify this message is in a conversation the user is part of
                    const { data: session } = await supabase
                        .from('message_sessions')
                        .select('participant_1, participant_2')
                        .eq('id', newMessage.session_id)
                        .single();

                    if (!session) return;

                    const isParticipant = session.participant_1 === user.id || session.participant_2 === user.id;
                    if (!isParticipant) return;

                    // Increment unread count optimistically
                    setTotalUnread(prev => prev + 1);

                    // Re-fetch to ensure accuracy (debounced to avoid spam)
                    setTimeout(() => {
                        fetchUnreadCount();
                    }, 1000);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, fetchUnreadCount]);

    // Subscribe to session_read_status changes
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`read-status:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "session_read_status",
                    filter: `user_id=eq.${user.id}`,
                },
                () => {
                    // When read status changes, re-fetch count
                    fetchUnreadCount();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, fetchUnreadCount]);

    return {
        totalUnread,
        loading,
        refetch: fetchUnreadCount,
        setActiveSession
    };
}
