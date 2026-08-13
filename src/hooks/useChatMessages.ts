import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { generateAnonymousIdentity } from "@/lib/generateChatAlias";
import { ChatMessage } from "@/components/chat/ChatView";
import { notifyNewDirectMessage } from "@/lib/dmNotifications";

const PAGE_SIZE = 20;
const TYPING_DEBOUNCE_MS = 500;

interface CachedUser {
    username: string | null;
    avatar_url: string | null;
}

// Simple in-memory cache for user profiles
const userCache = new Map<string, CachedUser>();

export function useChatMessages(sessionId: string | null, isAdmin = false) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [otherUser, setOtherUser] = useState<{ id: string; name: string; avatar?: string } | null>(null);
    const [isAnonymousMode, setIsAnonymousMode] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const offsetRef = useRef(0);

    // Get cached user or fetch from DB
    const getCachedUser = useCallback(async (userId: string): Promise<CachedUser> => {
        if (userCache.has(userId)) {
            return userCache.get(userId)!;
        }

        const { data } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", userId)
            .single();

        const userData: CachedUser = {
            username: data?.username || null,
            avatar_url: data?.avatar_url || null
        };

        userCache.set(userId, userData);
        return userData;
    }, []);

    // Transform raw message to ChatMessage format
    const transformMessage = useCallback(async (
        raw: any,
        currentUserId: string,
        sessionId: string,
        isAnon: boolean
    ): Promise<ChatMessage> => {
        const isSent = raw.sender_id === currentUserId;

        let senderName = 'Unknown';
        let senderAvatar: string | undefined;
        let avatarSeed: string | undefined;

        if (isSent) {
            // For sent messages, use current user's info
            const cached = await getCachedUser(currentUserId);
            senderName = cached.username || 'You';
            senderAvatar = cached.avatar_url || undefined;
        } else if (isAnon && raw.use_masked_identity) {
            // Anonymous mode - use masked alias
            senderName = raw.masked_alias || generateAnonymousIdentity(raw.sender_id, sessionId).alias;
            avatarSeed = generateAnonymousIdentity(raw.sender_id, sessionId).avatarSeed;
        } else {
            // Normal mode - fetch real user info. If the account is gone the
            // profile lookup comes back empty, so fall back to the username
            // snapshot stored on the message itself.
            const cached = raw.sender_id ? await getCachedUser(raw.sender_id) : { username: null, avatar_url: null };
            senderName = cached.username || raw.sender_username || 'deleted user';
            senderAvatar = cached.avatar_url || undefined;
        }

        return {
            id: raw.id,
            content: raw.content,
            senderId: raw.sender_id,
            senderName,
            senderAvatar,
            avatarSeed,
            createdAt: raw.created_at,
            status: 'delivered', // Messages from DB are delivered
            mediaUrl: raw.media_url || undefined,
            mediaType: raw.media_type || undefined,
            gifUrl: raw.gif_url || undefined,
            voiceUrl: raw.voice_url || undefined,
            voiceDuration: raw.voice_duration_seconds || undefined,
            isAnonymous: raw.use_masked_identity,
            // Only admins ever receive soft-deleted rows (enforced by RLS).
            isDeleted: raw.is_deleted === true
        };
    }, [getCachedUser]);

    // Load messages with pagination
    const loadMessages = useCallback(async (loadMore = false) => {
        if (!sessionId || !user) {
            setMessages([]);
            setLoading(false);
            return;
        }

        if (!loadMore) {
            setLoading(true);
            offsetRef.current = 0;
        }

        try {
            // Get session info first
            const { data: session } = await supabase
                .from("message_sessions")
                .select("participant_1, participant_2, status, participant_1_username, participant_2_username")
                .eq("id", sessionId)
                .single();

            if (session) {
                const isParticipant1 = session.participant_1 === user.id;
                const otherUserId = isParticipant1 ? session.participant_2 : session.participant_1;
                const otherSnapshot = isParticipant1
                    ? session.participant_2_username
                    : session.participant_1_username;

                setIsAnonymousMode(false);

                // Get other user info. A deleted account has no profile left, so
                // the session's username snapshot keeps the chat readable.
                const cached = otherUserId
                    ? await getCachedUser(otherUserId)
                    : { username: null, avatar_url: null };
                setOtherUser({
                    id: otherUserId,
                    name: cached.username || otherSnapshot || 'deleted user',
                    avatar: cached.avatar_url || undefined
                });
            }

            // Get messages
            const { data, error } = await supabase
                .from("session_messages")
                .select("*")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: false })
                .range(offsetRef.current, offsetRef.current + PAGE_SIZE - 1);

            if (error) throw error;

            setHasMore(data.length === PAGE_SIZE);
            offsetRef.current += data.length;

            // Transform messages
            const transformedMessages = await Promise.all(
                data.map(msg => transformMessage(msg, user.id, sessionId, isAnonymousMode))
            );

            // Reverse to show oldest first
            const orderedMessages = transformedMessages.reverse();

            if (loadMore) {
                setMessages(prev => [...orderedMessages, ...prev]);
            } else {
                setMessages(orderedMessages);
            }
        } catch (error) {
            console.error("Error loading messages:", error);
        } finally {
            setLoading(false);
        }
    }, [sessionId, user, getCachedUser, transformMessage, isAnonymousMode]);

    // Send message
    const sendMessage = useCallback(async (
        content: string,
        options?: {
            useMask?: boolean;
            mediaUrl?: string;
            mediaType?: 'image' | 'video';
            gifUrl?: string;
            gifId?: string;
            voiceUrl?: string;
            voiceDuration?: number;
        }
    ): Promise<boolean> => {
        if (!user || !sessionId) return false;

        try {
            const { error } = await supabase
                .from("session_messages")
                .insert({
                    session_id: sessionId,
                    sender_id: user.id,
                    use_masked_identity: options?.useMask || false,
                    masked_alias: options?.useMask ? generateAnonymousIdentity(user.id, sessionId).alias : null,
                    content: content || null,
                    media_url: options?.mediaUrl || null,
                    media_type: options?.mediaType || null,
                    gif_url: options?.gifUrl || null,
                    gif_id: options?.gifId || null,
                    voice_url: options?.voiceUrl || null,
                    voice_duration_seconds: options?.voiceDuration || null
                });

            if (error) throw error;

            // Let the recipient's bell say who messaged them.
            if (otherUser?.id) {
                const mediaKind = options?.voiceUrl ? 'voice'
                    : options?.gifUrl ? 'gif'
                        : options?.mediaType || null;

                notifyNewDirectMessage({
                    senderId: user.id,
                    recipientId: otherUser.id,
                    sessionId,
                    content,
                    mediaKind,
                    senderLabel: options?.useMask
                        ? generateAnonymousIdentity(user.id, sessionId).alias
                        : null,
                });
            }

            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            return false;
        }
    }, [user, sessionId, otherUser?.id]);

    // Upload media
    const uploadMedia = useCallback(async (file: File): Promise<{ url: string; type: 'image' | 'video' } | null> => {
        if (!user) return null;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from("media")
                .getPublicUrl(fileName);

            const type = file.type.startsWith('video/') ? 'video' : 'image';
            return { url: publicUrl, type };
        } catch (error) {
            console.error("Error uploading media:", error);
            return null;
        }
    }, [user]);

    // Upload voice
    const uploadVoice = useCallback(async (blob: Blob): Promise<string | null> => {
        if (!user) return null;

        try {
            const fileName = `${user.id}/${Date.now()}.webm`;

            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(fileName, blob, { contentType: 'audio/webm' });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from("media")
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (error) {
            console.error("Error uploading voice:", error);
            return null;
        }
    }, [user]);

    // Set up realtime subscription
    useEffect(() => {
        loadMessages();

        if (!sessionId || !user) return;

        channelRef.current = supabase
            .channel(`chat:${sessionId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "session_messages",
                    filter: `session_id=eq.${sessionId}`,
                },
                async (payload) => {
                    const newMsg = await transformMessage(payload.new, user.id, sessionId, isAnonymousMode);
                    setMessages(prev => [...prev, newMsg]);

                    // If message is from someone else, mark as read
                    if (payload.new.sender_id !== user.id) {
                        supabase.rpc('mark_session_as_read', {
                            target_session_id: sessionId
                        }).then(({ error }) => {
                            if (error) console.error("Error marking as read on message receive:", error);
                        });
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "session_messages",
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload) => {
                    // Soft deletes arrive as UPDATEs. Drop the message for
                    // participants; keep it flagged for admins.
                    if (!payload.new?.is_deleted) return;

                    setMessages(prev => isAdmin
                        ? prev.map(m => m.id === payload.new.id ? { ...m, isDeleted: true } : m)
                        : prev.filter(m => m.id !== payload.new.id));
                }
            )
            .subscribe();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [sessionId, user, loadMessages, transformMessage, isAnonymousMode, isAdmin]);

    // Debounced typing indicator
    const setTyping = useCallback((typing: boolean) => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        if (typing) {
            setIsTyping(true);
            typingTimeoutRef.current = setTimeout(() => {
                setIsTyping(false);
            }, TYPING_DEBOUNCE_MS);
        } else {
            setIsTyping(false);
        }
    }, []);

    // Archive a message (admin or sender). Nothing is deleted: participants
    // stop seeing it, admins keep seeing it flagged as archived.
    const archiveMessage = useCallback(async (messageId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const { error } = await supabase
                .rpc("archive_message", { p_message_id: messageId });

            if (error) throw error;

            if (isAdmin) {
                // Admins keep the row visible, now marked archived.
                setMessages(prev => prev.map(msg =>
                    msg.id === messageId ? { ...msg, isDeleted: true } : msg
                ));
            } else {
                setMessages(prev => prev.filter(msg => msg.id !== messageId));
            }
            return true;
        } catch (error) {
            console.error("Error archiving message:", error);
            return false;
        }
    }, [user, isAdmin]);

    // Admin-only: put an archived message back in front of the participants.
    const restoreMessage = useCallback(async (messageId: string): Promise<boolean> => {
        if (!user || !isAdmin) return false;

        try {
            const { error } = await supabase
                .rpc("unarchive_message", { p_message_id: messageId });

            if (error) throw error;

            setMessages(prev => prev.map(msg =>
                msg.id === messageId ? { ...msg, isDeleted: false } : msg
            ));
            return true;
        } catch (error) {
            console.error("Error restoring message:", error);
            return false;
        }
    }, [user, isAdmin]);

    return {
        messages,
        loading,
        hasMore,
        otherUser,
        isAnonymousMode,
        isTyping,
        sendMessage,
        uploadMedia,
        uploadVoice,
        archiveMessage,
        restoreMessage,
        loadMore: () => loadMessages(true),
        refresh: () => loadMessages(false),
        setTyping
    };
}
