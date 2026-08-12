import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export interface Conversation {
    id: string;
    participant_1: string;
    participant_2: string;
    status: 'active' | 'archived' | 'blocked' | 'deleted';
    last_activity_at: string;
    created_at: string;
    other_user?: {
        id: string;
        username: string | null;
        avatar_url: string | null;
    };
    last_message?: {
        content: string | null;
        sender_id: string;
        created_at: string;
        media_type?: 'image' | 'video' | null;
        gif_url?: string | null;
        voice_url?: string | null;
    };
    unread_count?: number;
    /** Admin-mode only: label for a chat the viewer is not a participant in. */
    admin_label?: string;
}

const buildAdminLabel = (a?: string | null, b?: string | null) =>
    `${a || 'Unknown'} ↔ ${b || 'Unknown'}`;

/**
 * @param adminAll Admin moderation mode - loads every conversation on the site,
 *                 including ones the admin is not a participant in and ones the
 *                 participants have deleted. RLS only permits this for admins.
 */
export function useConversations(adminAll = false) {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);

    // Derived total unread - no separate state needed
    const totalUnread = useMemo(() =>
        conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
        [conversations]);

    const loadConversations = useCallback(async () => {
        if (!user) {
            setConversations([]);
            setLoading(false);
            return;
        }

        try {
            // Single query with joins for sessions + last message
            let query = supabase
                .from("message_sessions")
                .select(`
                    *,
                    participant_1_profile:profiles!message_sessions_participant_1_fkey(id, username, avatar_url),
                    participant_2_profile:profiles!message_sessions_participant_2_fkey(id, username, avatar_url)
                `);

            if (!adminAll) {
                query = query
                    .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
                    .not("status", "in", "(blocked,deleted)");
            }

            const { data: sessionData, error } = await query
                .order("last_activity_at", { ascending: false });

            if (error) {
                console.error("Session query error:", error);
                // Fallback to simple query without joins
                let fallbackQuery = supabase
                    .from("message_sessions")
                    .select("*");

                if (!adminAll) {
                    fallbackQuery = fallbackQuery
                        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
                        .not("status", "in", "(blocked,deleted)");
                }

                const { data: fallbackData } = await fallbackQuery
                    .order("last_activity_at", { ascending: false });

                if (fallbackData && fallbackData.length > 0) {
                    // Get unique other user IDs
                    const otherUserIds = [...new Set(fallbackData.map(s =>
                        s.participant_1 === user.id ? s.participant_2 : s.participant_1
                    ))];

                    // Batch fetch profiles
                    const { data: profiles } = await supabase
                        .from("profiles")
                        .select("id, username, avatar_url")
                        .in("id", otherUserIds);

                    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

                    const enriched = fallbackData.map(session => {
                        const isParticipant = session.participant_1 === user.id
                            || session.participant_2 === user.id;
                        const otherUserId = session.participant_1 === user.id
                            ? session.participant_2
                            : session.participant_1;
                        return {
                            ...session,
                            other_user: profileMap.get(otherUserId),
                            admin_label: isParticipant ? undefined : buildAdminLabel(
                                profileMap.get(session.participant_1)?.username,
                                profileMap.get(session.participant_2)?.username
                            ),
                            unread_count: 0 // Skip unread for fallback
                        } as Conversation;
                    });

                    setConversations(enriched);
                } else {
                    setConversations([]);
                }
                setLoading(false);
                return;
            }

            if (!sessionData || sessionData.length === 0) {
                setConversations([]);
                setLoading(false);
                return;
            }

            // Map sessions with joined data
            const enriched = await Promise.all(sessionData.map(async (session) => {
                const isParticipant1 = session.participant_1 === user.id;
                const isParticipant = isParticipant1 || session.participant_2 === user.id;
                const otherUserProfile = isParticipant1
                    ? session.participant_2_profile
                    : session.participant_1_profile;

                // Fetch actual unread count from backend
                const { data: unreadCount } = await supabase.rpc('get_conversation_unread_count', {
                    p_session_id: session.id
                });

                // Fetch last message content
                const { data: lastMsg } = await supabase
                    .from("session_messages")
                    .select("content, media_type, gif_url, voice_url, created_at")
                    .eq("session_id", session.id)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .single();

                return {
                    id: session.id,
                    participant_1: session.participant_1,
                    participant_2: session.participant_2,
                    status: session.status,
                    last_activity_at: session.last_activity_at,
                    created_at: session.created_at,
                    other_user: otherUserProfile ? {
                        id: otherUserProfile.id,
                        username: otherUserProfile.username,
                        avatar_url: otherUserProfile.avatar_url
                    } : undefined,
                    admin_label: isParticipant ? undefined : buildAdminLabel(
                        session.participant_1_profile?.username,
                        session.participant_2_profile?.username
                    ),
                    unread_count: unreadCount || 0,
                    last_message: lastMsg ? {
                        content: lastMsg.content,
                        sender_id: '', // Not strictly needed here but following interface
                        created_at: lastMsg.created_at,
                        media_type: lastMsg.media_type,
                        gif_url: lastMsg.gif_url,
                        voice_url: lastMsg.voice_url
                    } : undefined
                } as Conversation;
            }));

            setConversations(enriched);
        } catch (error) {
            console.error("Error loading conversations:", error);
        } finally {
            setLoading(false);
        }
    }, [user, adminAll]);

    // Stable markAsRead function
    const markAsRead = useCallback(async (sessionId: string) => {
        if (!user) return;

        // Optimistic update
        setConversations(prev => prev.map(c =>
            c.id === sessionId ? { ...c, unread_count: 0 } : c
        ));

        try {
            await supabase.rpc('mark_session_as_read', {
                target_session_id: sessionId
            });
        } catch (error) {
            console.error("Error marking session as read:", error);
        }
    }, [user]);

    useEffect(() => {
        loadConversations();

        if (!user) return;

        const channel = supabase
            .channel(`conversations:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "session_messages",
                },
                () => loadConversations()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, loadConversations]);

    return {
        conversations,
        loading,
        totalUnread,
        refresh: loadConversations,
        markAsRead
    };
}
