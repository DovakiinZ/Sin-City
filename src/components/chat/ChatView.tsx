import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, MoreVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ChatBubble, { ChatBubbleProps } from "./ChatBubble";
import ChatInput from "./ChatInput";
import JumpToBottom from "./JumpToBottom";
import MediaComposer from "./MediaComposer";

export interface ChatMessage {
    id: string;
    content: string | null;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    avatarSeed?: string;
    createdAt: string;
    status?: 'sending' | 'sent' | 'delivered';
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'gif';
    gifUrl?: string;
    voiceUrl?: string;
    voiceDuration?: number;
    isAnonymous?: boolean;
}

interface ChatViewProps {
    sessionId: string;
    currentUserId: string;
    messages: ChatMessage[];
    loading: boolean;
    otherUserName: string;
    otherUserAvatar?: string;
    isAnonymousMode?: boolean;
    isAdmin?: boolean;
    isMobile?: boolean;
    onBack: () => void;
    onSendMessage: (content: string, media?: { url: string; type: 'image' | 'video' | 'gif' | 'voice'; duration?: number }) => void;
    onDeleteMessage?: (messageId: string) => void;
    onLoadMore?: () => void;
    hasMore?: boolean;
    onDeleteChat?: () => void;
    onProfileClick?: () => void;
    uploadMedia?: (file: File) => Promise<{ url: string; type: 'image' | 'video' } | null>;
    uploadVoice?: (blob: Blob) => Promise<string | null>;
}

export default function ChatView({
    sessionId,
    currentUserId,
    messages,
    loading,
    otherUserName,
    otherUserAvatar,
    isAnonymousMode,
    isAdmin,
    isMobile = false,
    onBack,
    onSendMessage,
    onDeleteMessage,
    onLoadMore,
    hasMore,
    onDeleteChat,
    onProfileClick,
    uploadMedia,
    uploadVoice
}: ChatViewProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);
    const [showMediaComposer, setShowMediaComposer] = useState(false);
    const [pendingMedia, setPendingMedia] = useState<{ url: string; type: 'image' | 'video' | 'gif'; file?: File } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);

    // Scroll to bottom
    const scrollToBottom = useCallback((smooth = true) => {
        messagesEndRef.current?.scrollIntoView({
            behavior: smooth ? 'smooth' : 'auto'
        });
    }, []);

    // Handle scroll events
    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Show jump button if scrolled up more than 200px
        setShowJumpToBottom(distanceFromBottom > 200);
        setIsAtBottom(distanceFromBottom < 50);

        // Load more when scrolled to top
        if (scrollTop < 100 && hasMore && onLoadMore) {
            onLoadMore();
        }
    }, [hasMore, onLoadMore]);

    // Auto-scroll on new messages (only if at bottom)
    useEffect(() => {
        if (isAtBottom && messages.length > 0) {
            scrollToBottom();
        }
    }, [messages.length, isAtBottom, scrollToBottom]);

    // Initial scroll to bottom
    useEffect(() => {
        scrollToBottom(false);
    }, [sessionId, scrollToBottom]);

    const handleSend = async (content: string, media?: { url: string; type: 'image' | 'video' | 'gif' }) => {
        onSendMessage(content, media);
        setPendingMedia(null);
        setTimeout(() => scrollToBottom(), 100);
    };

    const handleMediaSelect = async (file: File) => {
        if (!uploadMedia) return;

        setIsUploading(true);
        setShowMediaComposer(false);

        try {
            const result = await uploadMedia(file);
            if (result) {
                setPendingMedia({ ...result, file });
            }
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleGifSelect = (url: string, id: string) => {
        setPendingMedia({ url, type: 'gif' });
        setShowMediaComposer(false);
    };

    const handleVoiceSend = async (blob: Blob, duration: number) => {
        if (!uploadVoice) return;

        setIsUploading(true);
        try {
            const voiceUrl = await uploadVoice(blob);
            if (voiceUrl) {
                // Send voice message with proper type
                onSendMessage('', { url: voiceUrl, type: 'voice', duration });
            }
        } catch (error) {
            console.error('Voice upload failed:', error);
        } finally {
            setIsUploading(false);
            setShowMediaComposer(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-black">
            {/* Header */}
            <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-green-900/30 bg-black/90 backdrop-blur-sm">
                <button
                    onClick={onBack}
                    className="p-1 text-gray-400 hover:text-green-400 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>

                <button
                    onClick={onProfileClick}
                    className="flex items-center gap-3 flex-1 min-w-0"
                >
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                        <img
                            src={otherUserAvatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${otherUserName}`}
                            alt={otherUserName}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-mono text-sm text-green-400 truncate">{otherUserName}</h2>
                        {isAnonymousMode && (
                            <span className="text-[10px] text-gray-500">Anonymous mode</span>
                        )}
                    </div>
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="p-2 text-gray-400 hover:text-green-400 transition-colors"
                    >
                        <MoreVertical className="w-5 h-5" />
                    </button>

                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-gray-900 border border-green-900/30 rounded-lg shadow-xl z-50 overflow-hidden">
                                {onDeleteChat && (
                                    <button
                                        onClick={() => { onDeleteChat(); setShowMenu(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Chat
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* Messages Container */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="text-4xl mb-3">💬</div>
                        <p className="text-gray-500 text-sm">No messages yet</p>
                        <p className="text-gray-600 text-xs mt-1">Send a message to start the conversation</p>
                    </div>
                ) : (
                    <>
                        {hasMore && (
                            <div className="flex justify-center py-2">
                                <button
                                    onClick={onLoadMore}
                                    className="text-xs text-green-400 hover:text-green-300"
                                >
                                    Load older messages
                                </button>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <ChatBubble
                                key={msg.id}
                                id={msg.id}
                                content={msg.content}
                                senderName={msg.senderName}
                                senderAvatar={msg.senderAvatar}
                                avatarSeed={msg.avatarSeed}
                                timestamp={msg.createdAt}
                                isSent={msg.senderId === currentUserId}
                                status={msg.status}
                                mediaUrl={msg.mediaUrl}
                                mediaType={msg.mediaType}
                                gifUrl={msg.gifUrl}
                                voiceUrl={msg.voiceUrl}
                                voiceDuration={msg.voiceDuration}
                                isAnonymous={msg.isAnonymous}
                                isAdmin={isAdmin}
                                onAvatarClick={onProfileClick}
                                onDelete={onDeleteMessage}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Jump to Bottom Button */}
            <JumpToBottom
                visible={showJumpToBottom}
                onClick={() => scrollToBottom()}
            />

            {/* Chat Input */}
            <ChatInput
                onSend={handleSend}
                onOpenMediaPicker={() => setShowMediaComposer(true)}
                pendingMedia={pendingMedia}
                onClearMedia={() => setPendingMedia(null)}
                isUploading={isUploading}
            />

            {/* Media Composer Bottom Sheet */}
            {showMediaComposer && (
                <MediaComposer
                    onClose={() => setShowMediaComposer(false)}
                    onMediaSelect={handleMediaSelect}
                    onGifSelect={handleGifSelect}
                    onVoiceSend={handleVoiceSend}
                    isMobile={isMobile}
                />
            )}
        </div>
    );
}
