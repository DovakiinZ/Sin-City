import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import SessionsList from "./SessionsList";
import ChatView, { ChatMessage } from "./ChatView";
import { SessionData } from "./SessionItem";

interface ChatLayoutProps {
    // Sessions data
    sessions: SessionData[];
    sessionsLoading: boolean;

    // Active chat data
    activeSessionId: string | null;
    messages: ChatMessage[];
    messagesLoading: boolean;
    currentUserId: string;

    // Other user info for active chat
    activeOtherUserName?: string;
    activeOtherUserAvatar?: string;
    isAnonymousMode?: boolean;

    // Pagination
    hasMoreMessages?: boolean;
    onLoadMoreMessages?: () => void;

    // Actions
    onSelectSession: (sessionId: string) => void;
    onSendMessage: (content: string, media?: { url: string; type: 'image' | 'video' | 'gif' }) => void;
    onDeleteChat?: () => void;
    onNewChat?: () => void;

    // Media upload
    uploadMedia?: (file: File) => Promise<{ url: string; type: 'image' | 'video' } | null>;
    uploadVoice?: (blob: Blob) => Promise<string | null>;
}

export default function ChatLayout({
    sessions,
    sessionsLoading,
    activeSessionId,
    messages,
    messagesLoading,
    currentUserId,
    activeOtherUserName,
    activeOtherUserAvatar,
    isAnonymousMode,
    hasMoreMessages,
    onLoadMoreMessages,
    onSelectSession,
    onSendMessage,
    onDeleteChat,
    onNewChat,
    uploadMedia,
    uploadVoice
}: ChatLayoutProps) {
    const navigate = useNavigate();
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile viewport
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const handleBack = () => {
        if (isMobile) {
            // On mobile, just clear active session to show list
            onSelectSession('');
        }
    };

    const handleProfileClick = () => {
        // Navigate to profile if not anonymous
        if (!isAnonymousMode && activeSessionId) {
            const session = sessions.find(s => s.id === activeSessionId);
            if (session && session.otherUserName && session.otherUserName !== 'Unknown') {
                navigate(`/user/${session.otherUserName}`);
            }
        }
    };

    // Mobile: Stacked layout (show either list or chat)
    if (isMobile) {
        if (activeSessionId) {
            return (
                <div className="h-full">
                    <ChatView
                        sessionId={activeSessionId}
                        currentUserId={currentUserId}
                        messages={messages}
                        loading={messagesLoading}
                        otherUserName={activeOtherUserName || 'Unknown'}
                        otherUserAvatar={activeOtherUserAvatar}
                        isAnonymousMode={isAnonymousMode}
                        isMobile={true}
                        onBack={handleBack}
                        onSendMessage={onSendMessage}
                        onLoadMore={onLoadMoreMessages}
                        hasMore={hasMoreMessages}
                        onDeleteChat={onDeleteChat}
                        onProfileClick={handleProfileClick}
                        uploadMedia={uploadMedia}
                        uploadVoice={uploadVoice}
                    />
                </div>
            );
        }

        return (
            <div className="h-full">
                <SessionsList
                    sessions={sessions}
                    loading={sessionsLoading}
                    onSelectSession={onSelectSession}
                    onNewChat={onNewChat}
                    isMobile={true}
                />
            </div>
        );
    }

    // Desktop: Split view layout
    return (
        <div className="flex h-full">
            {/* Left: Sessions list */}
            <div className="w-80 flex-shrink-0">
                <SessionsList
                    sessions={sessions}
                    loading={sessionsLoading}
                    activeSessionId={activeSessionId || undefined}
                    onSelectSession={onSelectSession}
                    onNewChat={onNewChat}
                    isMobile={false}
                />
            </div>

            {/* Right: Chat view or empty state */}
            <div className="flex-1 min-w-0">
                {activeSessionId ? (
                    <ChatView
                        sessionId={activeSessionId}
                        currentUserId={currentUserId}
                        messages={messages}
                        loading={messagesLoading}
                        otherUserName={activeOtherUserName || 'Unknown'}
                        otherUserAvatar={activeOtherUserAvatar}
                        isAnonymousMode={isAnonymousMode}
                        isMobile={false}
                        onBack={handleBack}
                        onSendMessage={onSendMessage}
                        onLoadMore={onLoadMoreMessages}
                        hasMore={hasMoreMessages}
                        onDeleteChat={onDeleteChat}
                        onProfileClick={handleProfileClick}
                        uploadMedia={uploadMedia}
                        uploadVoice={uploadVoice}
                    />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center bg-black/50 text-center px-4">
                        <div className="w-20 h-20 rounded-full bg-green-900/20 flex items-center justify-center mb-6">
                            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <h3 className="font-mono text-xl text-green-400 mb-2">Select a conversation</h3>
                        <p className="text-gray-500 text-sm mb-6 max-w-xs">
                            Choose from your existing chats on the left, or start a new conversation
                        </p>
                        {onNewChat && (
                            <button
                                onClick={onNewChat}
                                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-black font-medium rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Start New Chat
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
