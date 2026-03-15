import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export interface SessionMessage {
    id: string;
    session_id: string;
    sender_id: string;
    use_masked_identity: boolean;
    masked_alias: string | null;
    content: string | null;
    // Media types
    media_url: string | null;
    media_type: 'image' | 'video' | null;
    gif_url: string | null;
    gif_id: string | null;
    voice_url: string | null;
    voice_duration_seconds: number | null;
    read_at: string | null;
    created_at: string;
}

export function useSessionMessages(sessionId: string | null) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<SessionMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [otherUser, setOtherUser] = useState<{ id: string; username: string | null; avatar_url: string | null } | null>(null);
    const [myMaskedAlias, setMyMaskedAlias] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const loadMessages = useCallback(async () => {
        if (!sessionId || !user) {
            setMessages([]);
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from("session_messages")
                .select("*")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: true });

            if (error) throw error;
            setMessages(data || []);

            // Get session to find other user
            const { data: session } = await supabase
                .from("message_sessions")
                .select("participant_1, participant_2")
                .eq("id", sessionId)
                .single();

            if (session) {
                const otherUserId = session.participant_1 === user.id
                    ? session.participant_2
                    : session.participant_1;

                const { data: profile } = await supabase
                    .from("profiles")
                    .select("id, username, avatar_url")
                    .eq("id", otherUserId)
                    .single();

                setOtherUser(profile);
            }

            // Get my masked alias
            const { data: aliasData } = await supabase
                .rpc("get_or_create_masked_alias", { p_user_id: user.id });
            setMyMaskedAlias(aliasData);

        } catch (error) {
            console.error("Error loading messages:", error);
        } finally {
            setLoading(false);
        }
    }, [sessionId, user]);

    const sendMessage = async (
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
                    content: content || null,
                    use_masked_identity: options?.useMask || false,
                    masked_alias: options?.useMask ? myMaskedAlias : null,
                    media_url: options?.mediaUrl || null,
                    media_type: options?.mediaType || null,
                    gif_url: options?.gifUrl || null,
                    gif_id: options?.gifId || null,
                    voice_url: options?.voiceUrl || null,
                    voice_duration_seconds: options?.voiceDuration || null,
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            return false;
        }
    };

    const uploadMedia = async (file: File): Promise<{ url: string; type: 'image' | 'video' } | null> => {
        if (!user) return null;

        // Validate file type
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            console.error("Invalid file type. Only images and videos allowed.");
            return null;
        }

        // Validate file size (50MB max)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            console.error("File too large. Max 50MB.");
            return null;
        }

        setUploading(true);
        try {
            // Sanitize filename
            const ext = file.name.split('.').pop()?.toLowerCase() || (isImage ? 'jpg' : 'mp4');
            const sanitizedName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const filePath = `${user.id}/${sanitizedName}`;

            const { error: uploadError } = await supabase.storage
                .from("message-media")
                .upload(filePath, file, { contentType: file.type });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from("message-media")
                .getPublicUrl(filePath);

            return { url: publicUrl, type: isImage ? 'image' : 'video' };
        } catch (error) {
            console.error("Error uploading media:", error);
            return null;
        } finally {
            setUploading(false);
        }
    };

    const uploadVoice = async (blob: Blob): Promise<string | null> => {
        if (!user) return null;

        try {
            const fileName = `${user.id}/${Date.now()}.webm`;
            const { error: uploadError } = await supabase.storage
                .from("voice-messages")
                .upload(fileName, blob, { contentType: 'audio/webm' });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from("voice-messages")
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (error) {
            console.error("Error uploading voice:", error);
            return null;
        }
    };

    const markAsRead = async () => {
        if (!user || !sessionId) return;

        try {
            await supabase
                .from("session_messages")
                .update({ read_at: new Date().toISOString() })
                .eq("session_id", sessionId)
                .neq("sender_id", user.id)
                .is("read_at", null);
        } catch (error) {
            console.error("Error marking messages as read:", error);
        }
    };

    useEffect(() => {
        loadMessages();

        if (!sessionId || !user) return;

        channelRef.current = supabase
            .channel(`messages:${sessionId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "session_messages",
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload) => {
                    setMessages((prev) => [...prev, payload.new as SessionMessage]);
                    if ((payload.new as SessionMessage).sender_id !== user.id) {
                        markAsRead();
                    }
                }
            )
            .subscribe();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [sessionId, user, loadMessages]);

    useEffect(() => {
        if (sessionId && user) {
            markAsRead();
        }
    }, [sessionId, user]);

    return {
        messages,
        loading,
        otherUser,
        myMaskedAlias,
        uploading,
        sendMessage,
        uploadMedia,
        uploadVoice,
        markAsRead,
        refresh: loadMessages,
    };
}
