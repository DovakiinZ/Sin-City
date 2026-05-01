import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ChatLayout, SessionData, ChatMessage } from "@/components/chat";
import StartChatModal from "@/components/chat/StartChatModal";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useStartChat } from "@/hooks/useStartChat";
import { generateAnonymousIdentity } from "@/lib/generateChatAlias";
import AsciiHeader from "@/components/AsciiHeader";
import { useConversations } from "@/hooks/useConversations";
import { useUnreadCount } from "@/hooks/useUnreadCount";

export default function ChatPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user, loading: authLoading } = useAuth();
    const { startChat } = useStartChat();
    const { setActiveSession } = useUnreadCount();

    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(
        searchParams.get('session') || null
    );

    const { conversations, loading: sessionsLoading, markAsRead, refresh: refreshSessions } = useConversations();

    // Map conversations to SessionData for ChatLayout
    const sessions: SessionData[] = useMemo(() => {
        return conversations.map(conv => ({
            id: conv.id,
            otherUserId: conv.other_user?.id || '',
            otherUserName: conv.other_user?.username || 'Unknown',
            otherUserAvatar: conv.other_user?.avatar_url || undefined,
            lastMessage: conv.last_message?.content || null,
            lastMessageType: conv.last_message?.voice_url ? 'voice' : 
                             conv.last_message?.media_type === 'video' ? 'video' : 
                             conv.last_message?.media_type === 'image' ? 'image' : 
                             conv.last_message?.gif_url ? 'gif' : 'text',
            lastMessageTime: conv.last_message?.created_at || conv.last_activity_at,
            unreadCount: conv.unread_count || 0,
            isAnonymous: false
        }));
    }, [conversations]);

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

    // Update URL when session changes
    useEffect(() => {
        if (activeSessionId) {
            navigate(`/chat?session=${activeSessionId}`, { replace: true });

            // Notify unread count hook about active session (prevents badge increment)
            setActiveSession(activeSessionId);

            // Mark as read when entering session
            markAsRead(activeSessionId);
        } else {
            // Clear active session when no session is selected
            setActiveSession(null);
        }
    }, [activeSessionId, navigate, markAsRead, setActiveSession]);

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

            refreshSessions();
            setActiveSessionId(null);
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
    };

    const handleStartNewChat = async (otherUserId: string, username: string) => {
        const sessionId = await startChat(otherUserId);
        if (sessionId) {
            refreshSessions();
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
