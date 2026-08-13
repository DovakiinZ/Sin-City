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
    const [chatError, setChatError] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminAllChats, setAdminAllChats] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(
        searchParams.get('session') || null
    );

    // Admins get inline moderation: archived messages stay visible, labelled.
    useEffect(() => {
        if (!user) {
            setIsAdmin(false);
            return;
        }

        let cancelled = false;
        supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()
            .then(({ data }) => {
                if (!cancelled) setIsAdmin(data?.role === 'admin');
            });

        return () => { cancelled = true; };
    }, [user]);

    const { conversations, loading: sessionsLoading, markAsRead, refresh: refreshSessions } =
        useConversations(isAdmin && adminAllChats, showArchived);

    // Map conversations to SessionData for ChatLayout
    const sessions: SessionData[] = useMemo(() => {
        return conversations.map(conv => ({
            id: conv.id,
            otherUserId: conv.other_user?.id || '',
            otherUserName: conv.admin_label || conv.other_user?.username || 'Unknown',
            otherUserAvatar: conv.other_user?.avatar_url || undefined,
            lastMessage: conv.last_message?.content || null,
            lastMessageType: conv.last_message?.voice_url ? 'voice' : 
                             conv.last_message?.media_type === 'video' ? 'video' : 
                             conv.last_message?.media_type === 'image' ? 'image' : 
                             conv.last_message?.gif_url ? 'gif' : 'text',
            lastMessageTime: conv.last_message?.created_at || conv.last_activity_at,
            unreadCount: conv.unread_count || 0,
            isAnonymous: false,
            isArchived: conv.status === 'archived' || conv.status === 'deleted'
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
        archiveMessage,
        restoreMessage,
        loadMore
    } = useChatMessages(activeSessionId, isAdmin);

    const activeConversation = conversations.find(c => c.id === activeSessionId);
    const activeIsArchived = activeConversation?.status === 'archived'
        || activeConversation?.status === 'deleted';

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

    // Chats are archived, never deleted: the chat leaves your list, every
    // message stays on record for the other participant and for admins.
    const handleArchiveChat = async () => {
        if (!activeSessionId || !user) return;

        try {
            const { error } = await supabase.rpc(
                activeIsArchived ? "unarchive_session" : "archive_session",
                { p_session_id: activeSessionId }
            );

            if (error) throw error;

            refreshSessions();
            if (!activeIsArchived && !showArchived) setActiveSessionId(null);
        } catch (error) {
            console.error("Error archiving chat:", error);
        }
    };

    const handleStartNewChat = async (otherUserId: string, username: string) => {
        const sessionId = await startChat(otherUserId);
        if (sessionId) {
            refreshSessions();
            setActiveSessionId(sessionId);
        } else {
            setChatError(`You can't message @${username} yet — a follow request between you has to be approved first.`);
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

            {/* Admin moderation bar */}
            {isAdmin && (
                <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-red-950/30 border-b border-red-900/40 font-mono text-xs">
                    <span className="text-red-400">
                        🛡 Admin view — nothing in a DM is ever deleted; archived messages stay visible and labelled
                    </span>
                    <button
                        onClick={() => { setAdminAllChats(v => !v); setActiveSessionId(null); }}
                        className={`px-2 py-1 rounded border transition-colors ${adminAllChats
                            ? "bg-red-600 border-red-500 text-black font-bold"
                            : "border-red-900/60 text-red-400 hover:border-red-500"}`}
                    >
                        {adminAllChats ? "Viewing: all chats" : "Viewing: my chats"}
                    </button>
                </div>
            )}

            {/* Follow-gate error */}
            {chatError && (
                <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-yellow-950/30 border-b border-yellow-900/40 font-mono text-xs text-yellow-400">
                    <span>{chatError}</span>
                    <button
                        onClick={() => setChatError(null)}
                        className="text-yellow-600 hover:text-yellow-300"
                    >
                        dismiss
                    </button>
                </div>
            )}

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
                    onArchiveMessage={archiveMessage}
                    onRestoreMessage={restoreMessage}
                    onArchiveChat={handleArchiveChat}
                    activeSessionArchived={activeIsArchived}
                    showArchived={showArchived}
                    onToggleArchived={() => { setShowArchived(v => !v); setActiveSessionId(null); }}
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
