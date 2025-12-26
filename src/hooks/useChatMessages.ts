import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { generateAnonymousIdentity } from "@/lib/generateChatAlias";
import { ChatMessage } from "@/components/chat/ChatView";

const PAGE_SIZE = 20;
const TYPING_DEBOUNCE_MS = 500;

interface CachedUser {
    username: string | null;
    avatar_url: string | null;
}

// Simple in-memory cache for user profiles
const userCache = new Map<string, CachedUser>();

export function useChatMessages(sessionId: string | null) {
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
            // Normal mode - fetch real user info
            const cached = await getCachedUser(raw.sender_id);
            senderName = cached.username || 'Unknown';
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
            isAnonymous: raw.use_masked_identity
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
                .from("chat_sessions")
                .select("participant_1, participant_2, participant_1_anonymous, participant_2_anonymous")
                .eq("id", sessionId)
                .single();

            if (session) {
                const isParticipant1 = session.participant_1 === user.id;
                const otherUserId = isParticipant1 ? session.participant_2 : session.participant_1;
                const otherIsAnon = isParticipant1 ? session.participant_2_anonymous : session.participant_1_anonymous;

                setIsAnonymousMode(otherIsAnon);

                // Get other user info
                if (otherIsAnon) {
                    const anonIdentity = generateAnonymousIdentity(otherUserId, sessionId);
                    setOtherUser({
                        id: otherUserId,
                        name: anonIdentity.alias,
                        avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${anonIdentity.avatarSeed}`
                    });
                } else {
                    const cached = await getCachedUser(otherUserId);
                    setOtherUser({
                        id: otherUserId,
                        name: cached.username || 'Unknown',
                        avatar: cached.avatar_url || undefined
                    });
                }
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
            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            return false;
        }
    }, [user, sessionId]);

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
                }
            )
            .subscribe();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [sessionId, user, loadMessages, transformMessage, isAnonymousMode]);

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
        loadMore: () => loadMessages(true),
        refresh: () => loadMessages(false),
        setTyping
    };
}
