import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, ArrowLeft, Send, Image, Check, Ban, UserX, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useConversations, Conversation } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useDeviceDetect } from "@/hooks/useDeviceDetect";
import { Link } from "react-router-dom";

// ============================================================================
// LOG MESSAGE COMPONENT - Terminal style (no bubbles)
// ============================================================================
interface LogMessageProps {
    senderName: string;
    content: string | null;
    attachments: { url: string; type: 'image' | 'video' | 'file'; name: string }[] | null;
    time: string;
    isSent: boolean;
}

function LogMessage({ senderName, content, attachments, time, isSent }: LogMessageProps) {
    const timeStr = new Date(time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    return (
        <div className="font-mono text-sm leading-relaxed group">
            {/* Attachments */}
            {attachments && attachments.length > 0 && (
                <div className="pl-14 pb-1">
                    {attachments.map((att, idx) => (
                        <div key={idx} className="inline-block mr-2 mb-1">
                            {att.type === 'image' && (
                                <img
                                    src={att.url}
                                    alt={att.name}
                                    className="max-w-[200px] max-h-32 rounded border border-green-500/30"
                                />
                            )}
                            {att.type === 'video' && (
                                <video src={att.url} controls className="max-w-[200px] max-h-32 rounded border border-green-500/30" />
                            )}
                            {att.type === 'file' && (
                                <a href={att.url} target="_blank" rel="noopener noreferrer"
                                    className="text-cyan-400 hover:underline">[📎 {att.name}]</a>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Log line */}
            {content && (
                <div className="flex items-start gap-1 hover:bg-green-500/5 px-2 py-0.5 -mx-2 rounded transition-colors">
                    <span className="text-gray-600 w-12 flex-shrink-0">[{timeStr}]</span>
                    <span className={`flex-shrink-0 ${isSent ? 'text-cyan-400' : 'text-green-400'}`}>
                        @{senderName}:
                    </span>
                    <span className="text-gray-200 break-words flex-1">{content}</span>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// REQUEST ITEM COMPONENT
// ============================================================================
interface RequestItemProps {
    conversation: Conversation;
    onAccept: () => void;
    onReject: () => void;
    onBlock: () => void;
    isIncoming: boolean;
}

function RequestItem({ conversation, onAccept, onReject, onBlock, isIncoming }: RequestItemProps) {
    const { other_user } = conversation;

    return (
        <div className="flex items-center gap-3 p-3 border-b border-green-900/30 hover:bg-green-500/5 transition-colors">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-black border border-green-500/40 flex items-center justify-center flex-shrink-0">
                {other_user?.avatar_url ? (
                    <img src={other_user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                    <span className="text-green-400 font-mono">{other_user?.username?.[0]?.toUpperCase() || '?'}</span>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="font-mono text-green-400 text-sm">@{other_user?.username || 'unknown'}</div>
                <div className="font-mono text-[10px] text-gray-600">
                    {isIncoming ? 'wants to message you' : 'request pending...'}
                </div>
            </div>

            {/* Actions */}
            {isIncoming ? (
                <div className="flex items-center gap-1">
                    <button
                        onClick={onAccept}
                        className="p-2 text-green-500 hover:bg-green-500/20 rounded transition-colors"
                        title="Accept"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onReject}
                        className="p-2 text-gray-500 hover:bg-gray-500/20 rounded transition-colors"
                        title="Ignore"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onBlock}
                        className="p-2 text-red-500 hover:bg-red-500/20 rounded transition-colors"
                        title="Block"
                    >
                        <Ban className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <span className="font-mono text-[10px] text-yellow-600">PENDING</span>
            )}
        </div>
    );
}

// ============================================================================
// CONVERSATION ITEM COMPONENT
// ============================================================================
interface ConversationItemProps {
    conversation: Conversation;
    onClick: () => void;
}

function ConversationItem({ conversation, onClick }: ConversationItemProps) {
    const { other_user, last_message, unread_count } = conversation;

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 p-3 border-b border-green-900/30 hover:bg-green-500/5 transition-colors text-left"
        >
            {/* Avatar */}
            <div className="relative w-10 h-10 rounded-full bg-black border border-green-500/40 flex items-center justify-center flex-shrink-0">
                {other_user?.avatar_url ? (
                    <img src={other_user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                    <span className="text-green-400 font-mono">{other_user?.username?.[0]?.toUpperCase() || '?'}</span>
                )}
                {unread_count && unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                        {unread_count > 9 ? '9' : unread_count}
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className={`font-mono text-sm ${unread_count ? 'text-green-400' : 'text-gray-300'}`}>
                    @{other_user?.username || 'unknown'}
                </div>
                {last_message && (
                    <div className="font-mono text-xs text-gray-600 truncate">
                        {last_message.content || '[attachment]'}
                    </div>
                )}
            </div>

            {/* Arrow */}
            <span className="font-mono text-gray-600">›</span>
        </button>
    );
}

// ============================================================================
// CHAT VIEW COMPONENT
// ============================================================================
interface ChatViewProps {
    conversationId: string;
    onBack: () => void;
    isMobile: boolean;
}

function ChatView({ conversationId, onBack, isMobile }: ChatViewProps) {
    const { user } = useAuth();
    const { messages, loading, otherUser, sendMessage, uploadAttachment } = useMessages(conversationId);
    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get current user's username
    const [myUsername, setMyUsername] = useState<string>('you');
    useEffect(() => {
        if (user?.id) {
            (async () => {
                const { data } = await (await import('@/lib/supabase')).supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', user.id)
                    .single();
                if (data?.username) setMyUsername(data.username);
            })();
        }
    }, [user?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim() || sending) return;
        setSending(true);
        await sendMessage(inputText.trim());
        setInputText("");
        setSending(false);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const attachment = await uploadAttachment(file);
        if (attachment) {
            await sendMessage("", [attachment]);
        }
        setUploading(false);
        e.target.value = '';
    };

    return (
        <div className={`flex flex-col bg-black ${isMobile ? 'h-screen' : 'h-full'}`}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-green-500/30">
                <button onClick={onBack} className="text-green-400 hover:text-green-300 p-1">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-8 h-8 rounded-full bg-black border border-green-500/40 flex items-center justify-center">
                    {otherUser?.avatar_url ? (
                        <img src={otherUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        <span className="text-green-400 font-mono text-sm">{otherUser?.username?.[0]?.toUpperCase() || '?'}</span>
                    )}
                </div>
                <span className="font-mono text-green-400">@{otherUser?.username || 'unknown'}</span>
            </div>

            {/* Log Messages */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
                {loading ? (
                    <div className="text-center text-gray-600 py-8">
                        <span className="animate-pulse">loading...</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-600 py-8">
                        <p className="mb-1">[no messages]</p>
                        <p className="text-xs">start the conversation...</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {/* Session header */}
                        <div className="text-center text-gray-700 text-xs py-2 border-b border-green-900/20 mb-3">
                            ─── session started ───
                        </div>
                        {messages.map((msg) => (
                            <LogMessage
                                key={msg.id}
                                senderName={msg.sender_id === user?.id ? myUsername : (otherUser?.username || 'user')}
                                content={msg.content}
                                attachments={msg.attachments}
                                time={msg.created_at}
                                isSent={msg.sender_id === user?.id}
                            />
                        ))}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-green-500/30">
                <div className="flex items-center gap-2 font-mono">
                    <span className="text-green-600">{'>'}</span>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        accept="image/*,video/*"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="text-gray-600 hover:text-green-400 disabled:opacity-50"
                    >
                        {uploading ? '...' : <Image className="w-4 h-4" />}
                    </button>
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="type message..."
                        className="flex-1 bg-transparent text-gray-100 placeholder-gray-700 focus:outline-none text-sm"
                    />
                    <button
                        onClick={handleSend}
                        disabled={sending || !inputText.trim()}
                        className="text-green-500 hover:text-green-400 disabled:text-gray-700"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// INBOX VIEW COMPONENT
// ============================================================================
interface InboxViewProps {
    onSelectConversation: (id: string) => void;
    onClose: () => void;
    isMobile: boolean;
}

function InboxView({ onSelectConversation, onClose, isMobile }: InboxViewProps) {
    const { conversations, requests, loading, acceptRequest, rejectRequest, blockUser } = useConversations();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'requests' | 'conversations'>('conversations');

    const incomingRequests = requests.filter(r => r.is_request_to_me);
    const outgoingRequests = requests.filter(r => !r.is_request_to_me);
    const requestCount = incomingRequests.length;

    return (
        <div className={`flex flex-col bg-black ${isMobile ? 'h-screen' : 'h-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-green-500/30">
                <div className="flex items-center gap-2 font-mono">
                    <MessageCircle className="w-5 h-5 text-green-500" />
                    <span className="text-green-400 font-bold">MESSAGES</span>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-red-400 p-1">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-green-900/30">
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`flex-1 py-2 px-4 font-mono text-sm transition-colors relative ${activeTab === 'requests'
                            ? 'text-green-400 bg-green-500/10'
                            : 'text-gray-500 hover:text-gray-400'
                        }`}
                >
                    Requests
                    {requestCount > 0 && (
                        <span className="absolute top-1.5 right-2 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center">
                            {requestCount}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('conversations')}
                    className={`flex-1 py-2 px-4 font-mono text-sm transition-colors ${activeTab === 'conversations'
                            ? 'text-green-400 bg-green-500/10'
                            : 'text-gray-500 hover:text-gray-400'
                        }`}
                >
                    Conversations
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <span className="text-gray-600 font-mono animate-pulse">loading...</span>
                    </div>
                ) : activeTab === 'requests' ? (
                    <>
                        {incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
                            <div className="text-center text-gray-600 font-mono py-16">
                                <p>[no requests]</p>
                            </div>
                        ) : (
                            <>
                                {/* Incoming requests */}
                                {incomingRequests.length > 0 && (
                                    <div>
                                        <div className="px-4 py-2 text-[10px] font-mono text-gray-600 bg-green-950/20">
                                            INCOMING ({incomingRequests.length})
                                        </div>
                                        {incomingRequests.map((req) => (
                                            <RequestItem
                                                key={req.id}
                                                conversation={req}
                                                onAccept={() => acceptRequest(req.id)}
                                                onReject={() => rejectRequest(req.id)}
                                                onBlock={() => blockUser(req.id)}
                                                isIncoming={true}
                                            />
                                        ))}
                                    </div>
                                )}
                                {/* Outgoing requests */}
                                {outgoingRequests.length > 0 && (
                                    <div>
                                        <div className="px-4 py-2 text-[10px] font-mono text-gray-600 bg-green-950/20">
                                            SENT ({outgoingRequests.length})
                                        </div>
                                        {outgoingRequests.map((req) => (
                                            <RequestItem
                                                key={req.id}
                                                conversation={req}
                                                onAccept={() => { }}
                                                onReject={() => { }}
                                                onBlock={() => { }}
                                                isIncoming={false}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <>
                        {conversations.length === 0 ? (
                            <div className="text-center text-gray-600 font-mono py-16">
                                <p>[no conversations]</p>
                                <p className="text-xs mt-2">accepted requests appear here</p>
                            </div>
                        ) : (
                            conversations.map((convo) => (
                                <ConversationItem
                                    key={convo.id}
                                    conversation={convo}
                                    onClick={() => onSelectConversation(convo.id)}
                                />
                            ))
                        )}
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-green-900/30 font-mono text-[10px] text-gray-700">
                {conversations.length} active · {requests.length} pending
            </div>
        </div>
    );
}

// ============================================================================
// GUEST LOGIN PROMPT
// ============================================================================
function GuestPrompt({ onClose }: { onClose: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-black p-8 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-green-500/30 flex items-center justify-center mb-6">
                <LogIn className="w-8 h-8 text-green-500/50" />
            </div>
            <h2 className="font-mono text-green-400 text-lg mb-2">ACCESS DENIED</h2>
            <p className="font-mono text-gray-500 text-sm mb-6">
                Messaging is available for registered users only.
            </p>
            <div className="flex gap-3">
                <Link
                    to="/login"
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-black font-mono text-sm rounded transition-colors"
                    onClick={onClose}
                >
                    Login
                </Link>
                <Link
                    to="/register"
                    className="px-4 py-2 border border-green-500/50 text-green-400 hover:bg-green-500/10 font-mono text-sm rounded transition-colors"
                    onClick={onClose}
                >
                    Register
                </Link>
            </div>
            <button
                onClick={onClose}
                className="mt-6 text-gray-600 hover:text-gray-400 font-mono text-xs"
            >
                [close]
            </button>
        </div>
    );
}

// ============================================================================
// MAIN WIDGET COMPONENT
// ============================================================================
interface MessagesWidgetProps {
    initialConversationId?: string;
    onConversationOpened?: () => void;
}

export default function MessagesWidget({ initialConversationId, onConversationOpened }: MessagesWidgetProps) {
    const { user } = useAuth();
    const { totalUnread } = useConversations();
    const { isMobile } = useDeviceDetect();
    const [isOpen, setIsOpen] = useState(false);
    const [activeConversation, setActiveConversation] = useState<string | null>(initialConversationId || null);

    useEffect(() => {
        if (initialConversationId) {
            setActiveConversation(initialConversationId);
            setIsOpen(true);
            onConversationOpened?.();
        }
    }, [initialConversationId, onConversationOpened]);

    const handleClose = () => {
        setIsOpen(false);
        setActiveConversation(null);
    };

    // Panel/Full-screen container
    const containerClasses = isMobile
        ? `fixed inset-0 z-50 transform transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
        : `fixed top-0 right-0 h-full w-[350px] border-l border-green-500/30 z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`;

    return (
        <>
            {/* Backdrop (desktop only) */}
            {isOpen && !isMobile && (
                <div
                    className="fixed inset-0 bg-black/40 z-40"
                    onClick={handleClose}
                />
            )}

            {/* Container */}
            <div className={containerClasses}>
                {!user ? (
                    <GuestPrompt onClose={handleClose} />
                ) : activeConversation ? (
                    <ChatView
                        conversationId={activeConversation}
                        onBack={() => setActiveConversation(null)}
                        isMobile={isMobile}
                    />
                ) : (
                    <InboxView
                        onSelectConversation={setActiveConversation}
                        onClose={handleClose}
                        isMobile={isMobile}
                    />
                )}
            </div>

            {/* FAB Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed ${isMobile ? 'bottom-4 right-4' : 'bottom-6 right-6'} z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 bg-black border border-green-500/60 hover:border-green-400 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)] ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                aria-label="Open messages"
            >
                <MessageCircle className="w-5 h-5 text-green-400" />
                {totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-mono">
                        {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                )}
            </button>
        </>
    );
}

export function useMessagesWidget() {
    const [pendingConversation, setPendingConversation] = useState<string | null>(null);

    const openConversation = (conversationId: string) => {
        setPendingConversation(conversationId);
    };

    const clearPending = () => {
        setPendingConversation(null);
    };

    return {
        pendingConversation,
        openConversation,
        clearPending,
    };
}
