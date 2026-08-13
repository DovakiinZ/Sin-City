import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export interface Session {
    id: string;
    participant_1: string;
    participant_2: string;
    status: 'active' | 'archived' | 'blocked' | 'deleted';
    started_at: string;
    last_activity_at: string;
    archived_at: string | null;
    message_count: number;
    // Enriched data
    other_user?: {
        id: string;
        username: string | null;
        avatar_url: string | null;
    };
    last_message?: {
        content: string | null;
        use_masked_identity: boolean;
        masked_alias: string | null;
        created_at: string;
    };
    unread_count?: number;
}

export function useSessions() {
    const { user } = useAuth();
    const [activeSessions, setActiveSessions] = useState<Session[]>([]);
    const [archivedSessions, setArchivedSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalUnread, setTotalUnread] = useState(0);

    const loadSessions = useCallback(async () => {
        if (!user) {
            setActiveSessions([]);
            setArchivedSessions([]);
            setTotalUnread(0);
            setLoading(false);
            return;
        }

        try {
            const { data: sessions, error } = await supabase
                .from("message_sessions")
                .select("*")
                .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
                .not("status", "eq", "blocked")
                .order("last_activity_at", { ascending: false });

            if (error) throw error;

            if (!sessions || sessions.length === 0) {
                setActiveSessions([]);
                setArchivedSessions([]);
                setTotalUnread(0);
                setLoading(false);
                return;
            }

            // Enrich sessions with other user data and last message
            const enrichedSessions = await Promise.all(
                sessions.map(async (session) => {
                    const otherUserId = session.participant_1 === user.id
                        ? session.participant_2
                        : session.participant_1;

                    // Get other user profile. A deleted account leaves the
                    // participant id NULL, so fall back to the snapshot name.
                    const otherSnapshot = session.participant_1 === user.id
                        ? session.participant_2_username
                        : session.participant_1_username;

                    const { data: profile } = otherUserId
                        ? await supabase
                            .from("profiles")
                            .select("id, username, avatar_url")
                            .eq("id", otherUserId)
                            .single()
                        : { data: null };

                    // Get last message
                    const { data: lastMsg } = await supabase
                        .from("session_messages")
                        .select("content, use_masked_identity, masked_alias, created_at")
                        .eq("session_id", session.id)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .single();

                    // Get unread count
                    const { count: unreadCount } = await supabase
                        .from("session_messages")
                        .select("*", { count: "exact", head: true })
                        .eq("session_id", session.id)
                        .neq("sender_id", user.id)
                        .is("read_at", null);

                    return {
                        ...session,
                        other_user: profile || (otherSnapshot
                            ? { id: '', username: otherSnapshot, avatar_url: null }
                            : undefined),
                        last_message: lastMsg || undefined,
                        unread_count: unreadCount || 0,
                    };
                })
            );

            // Separate active and archived. 'deleted' is a legacy status from
            // before DMs became archive-only - treat it as archived.
            const active = enrichedSessions.filter(s => s.status === 'active');
            const archived = enrichedSessions.filter(s =>
                s.status === 'archived' || s.status === 'deleted');

            setActiveSessions(active);
            setArchivedSessions(archived);
            setTotalUnread(active.reduce((sum, s) => sum + (s.unread_count || 0), 0));
        } catch (error) {
            console.error("Error loading sessions:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const startSession = async (otherUserId: string): Promise<string | null> => {
        if (!user) return null;

        try {
            const { data, error } = await supabase
                .rpc("get_or_create_session", { p_other_user_id: otherUserId });

            if (error) throw error;
            loadSessions();
            return data as string;
        } catch (error) {
            console.error("Error starting session:", error);
            return null;
        }
    };

    // Archiving is the only way a chat ever leaves the active list. Every
    // message stays readable for both participants and for admins.
    const archiveSession = async (sessionId: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .rpc("archive_session", { p_session_id: sessionId });

            if (error) throw error;
            loadSessions();
            return true;
        } catch (error) {
            console.error("Error archiving session:", error);
            return false;
        }
    };

    const unarchiveSession = async (sessionId: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .rpc("unarchive_session", { p_session_id: sessionId });

            if (error) throw error;
            loadSessions();
            return true;
        } catch (error) {
            console.error("Error restoring session:", error);
            return false;
        }
    };

    const blockSession = async (sessionId: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from("message_sessions")
                .update({ status: 'blocked' })
                .eq("id", sessionId);

            if (error) throw error;
            loadSessions();
            return true;
        } catch (error) {
            console.error("Error blocking session:", error);
            return false;
        }
    };

    /**
     * @deprecated DMs are never deleted. Kept as an alias so older callers
     * archive instead of destroying anything.
     */
    const deleteSession = archiveSession;

    useEffect(() => {
        loadSessions();

        if (!user) return;

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`sessions:${user.id}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "session_messages" },
                () => loadSessions()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "message_sessions" },
                () => loadSessions()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, loadSessions]);

    return {
        activeSessions,
        archivedSessions,
        loading,
        totalUnread,
        startSession,
        archiveSession,
        unarchiveSession,
        blockSession,
        deleteSession,
        refresh: loadSessions,
    };
}
