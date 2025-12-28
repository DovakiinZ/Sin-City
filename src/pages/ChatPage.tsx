import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ChatLayout, SessionData, ChatMessage } from "@/components/chat";
import StartChatModal from "@/components/chat/StartChatModal";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useStartChat } from "@/hooks/useStartChat";
import { generateAnonymousIdentity } from "@/lib/generateChatAlias";
import AsciiHeader from "@/components/AsciiHeader";

export default function ChatPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user, loading: authLoading } = useAuth();
    const { startChat } = useStartChat();

    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(
        searchParams.get('session') || null
    );

    const {
        messages,
        loading: messagesLoading,
        hasMore,
        otherUser,
        isAnonymousMode,
        sendMessage,
        uploadMedia,
        uploadVoice,
        deleteMessage,
        loadMore
    } = useChatMessages(activeSessionId);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            navigate('/login', { replace: true });
        }
    }, [authLoading, user, navigate]);

    // Check if user is admin
    useEffect(() => {
        if (!user) return;
        supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()
            .then(({ data }) => {
                if (data?.role === 'admin') setIsAdmin(true);
            });
    }, [user]);

    // Load sessions
    useEffect(() => {
        if (!user) return;

        const loadSessions = async () => {
            setSessionsLoading(true);
            try {
                const { data, error } = await supabase
                    .from("message_sessions")
                    .select(`
            id,
            participant_1,
            participant_2,
            status,
            created_at,
            last_activity_at
          `)
                    .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
                    .neq("status", "blocked")
                    .order("last_activity_at", { ascending: false });

                if (error) throw error;

                // Transform to SessionData
                const transformed: SessionData[] = await Promise.all(
                    (data || []).map(async (session) => {
                        const isParticipant1 = session.participant_1 === user.id;
                        const otherUserId = isParticipant1 ? session.participant_2 : session.participant_1;

                        let otherUserName = 'Unknown';
                        let otherUserAvatar: string | undefined;
                        let avatarSeed: string | undefined;

                        // Get profile for other user
                        const { data: profile } = await supabase
                            .from("profiles")
                            .select("username, avatar_url")
                            .eq("id", otherUserId)
                            .single();

                        otherUserName = profile?.username || 'Unknown';
                        otherUserAvatar = profile?.avatar_url || undefined;

                        // Get last message
                        const { data: lastMsg } = await supabase
                            .from("session_messages")
                            .select("content, media_type, gif_url, voice_url, created_at")
                            .eq("session_id", session.id)
                            .order("created_at", { ascending: false })
                            .limit(1)
                            .single();

                        // Get unread count
                        const { count } = await supabase
                            .from("session_messages")
                            .select("*", { count: 'exact', head: true })
                            .eq("session_id", session.id)
                            .neq("sender_id", user.id)
                            .is("read_at", null);

                        let lastMessageType: 'text' | 'image' | 'video' | 'gif' | 'voice' = 'text';
                        if (lastMsg?.voice_url) lastMessageType = 'voice';
                        else if (lastMsg?.gif_url) lastMessageType = 'gif';
                        else if (lastMsg?.media_type) lastMessageType = lastMsg.media_type as 'image' | 'video';

                        return {
                            id: session.id,
                            otherUserId,
                            otherUserName,
                            otherUserAvatar,
                            avatarSeed,
                            lastMessage: lastMsg?.content || null,
                            lastMessageType,
                            lastMessageTime: lastMsg?.created_at || session.last_activity_at,
                            unreadCount: count || 0,
                            isAnonymous: false
                        };
                    })
                );

                setSessions(transformed);
            } catch (error) {
                console.error("Error loading sessions:", error);
            } finally {
                setSessionsLoading(false);
            }
        };

        loadSessions();
    }, [user]);

    // Update URL when session changes
    useEffect(() => {
        if (activeSessionId) {
            navigate(`/chat?session=${activeSessionId}`, { replace: true });
        }
    }, [activeSessionId, navigate]);

    const handleSendMessage = async (content: string, media?: { url: string; type: 'image' | 'video' | 'gif' | 'voice'; duration?: number }) => {
        if (!activeSessionId) return;

        await sendMessage(content, {
            mediaUrl: media?.type === 'image' || media?.type === 'video' ? media.url : undefined,
            mediaType: media?.type === 'image' || media?.type === 'video' ? media.type : undefined,
            gifUrl: media?.type === 'gif' ? media.url : undefined,
            voiceUrl: media?.type === 'voice' ? media.url : undefined,
            voiceDuration: media?.type === 'voice' ? media.duration : undefined
        });
    };

    const handleDeleteChat = async () => {
        if (!activeSessionId || !user) return;

        try {
            await supabase
                .from("message_sessions")
                .delete()
                .eq("id", activeSessionId);

            setSessions(prev => prev.filter(s => s.id !== activeSessionId));
            setActiveSessionId(null);
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
    };

    const handleStartNewChat = async (otherUserId: string, username: string) => {
        const sessionId = await startChat(otherUserId);
        if (sessionId) {
            // Add to sessions list optimistically
            setSessions(prev => {
                const exists = prev.some(s => s.id === sessionId);
                if (exists) return prev;
                return [{
                    id: sessionId,
                    otherUserId,
                    otherUserName: username,
                    lastMessage: null,
                    lastMessageType: 'text',
                    lastMessageTime: new Date().toISOString(),
                    unreadCount: 0,
                    isAnonymous: false
                }, ...prev];
            });
            setActiveSessionId(sessionId);
        }
        setShowNewChatModal(false);
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    // Transform ChatMessage[] to proper format
    const transformedMessages: ChatMessage[] = messages;

    return (
        <div className="min-h-screen bg-black flex flex-col">
            {/* Header - hidden on mobile when in chat */}
            <div className="md:block hidden">
                <AsciiHeader />
            </div>

            {/* Chat area - full height */}
            <div className="flex-1" style={{ height: 'calc(100vh - 60px)' }}>
                <ChatLayout
                    sessions={sessions}
                    sessionsLoading={sessionsLoading}
                    activeSessionId={activeSessionId}
                    messages={transformedMessages}
                    messagesLoading={messagesLoading}
                    currentUserId={user.id}
                    activeOtherUserName={otherUser?.name}
                    activeOtherUserAvatar={otherUser?.avatar}
                    isAnonymousMode={isAnonymousMode}
                    isAdmin={isAdmin}
                    hasMoreMessages={hasMore}
                    onLoadMoreMessages={loadMore}
                    onSelectSession={(id) => setActiveSessionId(id || null)}
                    onSendMessage={handleSendMessage}
                    onDeleteMessage={deleteMessage}
                    onDeleteChat={handleDeleteChat}
                    onNewChat={() => setShowNewChatModal(true)}
                    uploadMedia={uploadMedia}
                    uploadVoice={uploadVoice}
                />
            </div>

            {/* Start New Chat Modal */}
            <StartChatModal
                isOpen={showNewChatModal}
                onClose={() => setShowNewChatModal(false)}
                onStartChat={handleStartNewChat}
            />
        </div>
    );
}
