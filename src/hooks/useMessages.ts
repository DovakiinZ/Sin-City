import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string | null;
    attachments: { url: string; type: 'image' | 'video' | 'file'; name: string }[] | null;
    read_at: string | null;
    created_at: string;
}

export interface OtherUser {
    id: string;
    username: string | null;
    avatar_url: string | null;
}

const PAGE_SIZE = 50;

export function useMessages(conversationId: string | null) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
    const [showReadReceipts, setShowReadReceipts] = useState(true);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const loadMessages = useCallback(async () => {
        if (!conversationId || !user) {
            setMessages([]);
            setLoading(false);
            return;
        }

        try {
            // Get messages with pagination (newest first, then reverse for display)
            const { data, error } = await supabase
                .from("messages")
                .select("*")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: false })
                .limit(PAGE_SIZE);

            if (error) throw error;

            // Reverse for display (newest at bottom)
            const reversedData = (data || []).reverse();
            setMessages(reversedData);
            setHasMore((data || []).length === PAGE_SIZE);

            // Get conversation to find other user
            const { data: convo } = await supabase
                .from("conversations")
                .select("participant_1, participant_2")
                .eq("id", conversationId)
                .single();

            if (convo) {
                const otherUserId = convo.participant_1 === user.id
                    ? convo.participant_2
                    : convo.participant_1;

                const { data: profile } = await supabase
                    .from("profiles")
                    .select("id, username, avatar_url")
                    .eq("id", otherUserId)
                    .single();

                setOtherUser(profile);
            }

            // Get user's read receipts setting
            const { data: settings } = await supabase
                .from("user_settings")
                .select("show_read_receipts")
                .eq("user_id", user.id)
                .single();

            setShowReadReceipts(settings?.show_read_receipts ?? true);

        } catch (error) {
            console.error("Error loading messages:", error);
        } finally {
            setLoading(false);
        }
    }, [conversationId, user]);

    const sendMessage = async (content: string, attachments?: { url: string; type: 'image' | 'video' | 'file'; name: string }[]) => {
        if (!user || !conversationId) return false;

        try {
            const { error } = await supabase
                .from("messages")
                .insert({
                    conversation_id: conversationId,
                    sender_id: user.id,
                    content: content || null,
                    attachments: attachments && attachments.length > 0 ? attachments : null,
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            return false;
        }
    };

    const markAsRead = async () => {
        if (!user || !conversationId) return;

        try {
            await supabase
                .from("messages")
                .update({ read_at: new Date().toISOString() })
                .eq("conversation_id", conversationId)
                .neq("sender_id", user.id)
                .is("read_at", null);
        } catch (error) {
            console.error("Error marking messages as read:", error);
        }
    };

    const loadMoreMessages = useCallback(async () => {
        if (!conversationId || !user || messages.length === 0 || loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
            const oldestMessage = messages[0];

            const { data, error } = await supabase
                .from("messages")
                .select("*")
                .eq("conversation_id", conversationId)
                .lt("created_at", oldestMessage.created_at)
                .order("created_at", { ascending: false })
                .limit(PAGE_SIZE);

            if (error) throw error;

            if (data && data.length > 0) {
                // Reverse and prepend older messages
                setMessages(prev => [...data.reverse(), ...prev]);
                setHasMore(data.length === PAGE_SIZE);
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error("Error loading more messages:", error);
        } finally {
            setLoadingMore(false);
        }
    }, [conversationId, user, messages, loadingMore, hasMore]);

    const uploadAttachment = async (file: File): Promise<{ url: string; type: 'image' | 'video' | 'file'; name: string } | null> => {
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

            // Determine file type
            let type: 'image' | 'video' | 'file' = 'file';
            if (file.type.startsWith('image/')) type = 'image';
            else if (file.type.startsWith('video/')) type = 'video';

            return {
                url: publicUrl,
                type,
                name: file.name,
            };
        } catch (error) {
            console.error("Error uploading attachment:", error);
            return null;
        }
    };

    useEffect(() => {
        loadMessages();

        if (!conversationId || !user) return;

        // Subscribe to new messages in this conversation
        channelRef.current = supabase
            .channel(`messages:${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    setMessages((prev) => [...prev, payload.new as Message]);
                    // Auto-mark as read if it's from the other user
                    if ((payload.new as Message).sender_id !== user.id) {
                        markAsRead();
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "messages",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    setMessages((prev) =>
                        prev.map((m) => m.id === (payload.new as Message).id ? payload.new as Message : m)
                    );
                }
            )
            .subscribe();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [conversationId, user, loadMessages]);

    // Mark messages as read when viewing conversation
    useEffect(() => {
        if (conversationId && user) {
            markAsRead();
        }
    }, [conversationId, user]);

    return {
        messages,
        loading,
        loadingMore,
        hasMore,
        otherUser,
        showReadReceipts,
        sendMessage,
        markAsRead,
        uploadAttachment,
        loadMoreMessages,
        refresh: loadMessages,
    };
}
