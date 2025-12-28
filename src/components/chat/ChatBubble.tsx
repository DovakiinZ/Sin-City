import { useState, useRef, useEffect } from "react";
import { Check, CheckCheck, ChevronDown, ChevronUp, Play, Pause, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatBubbleProps {
    id: string;
    content: string | null;
    senderName: string;
    senderAvatar?: string;
    avatarSeed?: string;
    timestamp: string;
    isSent: boolean; // true = sent by current user
    status?: 'sending' | 'sent' | 'delivered';
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'gif';
    gifUrl?: string;
    voiceUrl?: string;
    voiceDuration?: number;
    isAnonymous?: boolean;
    isAdmin?: boolean;
    onLongPress?: () => void;
    onAvatarClick?: () => void;
    onDelete?: (messageId: string) => void;
}

const MAX_COLLAPSED_LENGTH = 300;

export default function ChatBubble({
    id,
    content,
    senderName,
    senderAvatar,
    avatarSeed,
    timestamp,
    isSent,
    status = 'sent',
    mediaUrl,
    mediaType,
    gifUrl,
    voiceUrl,
    voiceDuration,
    isAnonymous,
    isAdmin,
    onLongPress,
    onAvatarClick,
    onDelete
}: ChatBubbleProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showFullscreen, setShowFullscreen] = useState(false);
    const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: 'image' | 'video' | 'gif' } | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const isLongMessage = content && content.length > MAX_COLLAPSED_LENGTH;
    const displayContent = isLongMessage && !isExpanded
        ? content.slice(0, MAX_COLLAPSED_LENGTH) + '...'
        : content;

    // Generate deterministic avatar from seed for anonymous users
    const avatarUrl = senderAvatar || (avatarSeed
        ? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${avatarSeed}`
        : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${senderName}`);

    const formatTime = (ts: string) => {
        const date = new Date(ts);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handlePointerDown = () => {
        longPressTimer.current = setTimeout(() => {
            onLongPress?.();
        }, 500);
    };

    const handlePointerUp = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleMediaClick = (url: string, type: 'image' | 'video' | 'gif') => {
        setFullscreenMedia({ url, type });
        setShowFullscreen(true);
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const handleEnded = () => setIsPlaying(false);
        audio.addEventListener('ended', handleEnded);
        return () => audio.removeEventListener('ended', handleEnded);
    }, []);

    return (
        <>
            <div
                className={cn(
                    "flex gap-2 max-w-[85%] mb-3",
                    isSent ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                {/* Avatar */}
                {!isSent && (
                    <button
                        onClick={onAvatarClick}
                        className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gray-800 hover:ring-2 hover:ring-green-500/50 transition-all"
                    >
                        <img src={avatarUrl} alt={senderName} className="w-full h-full object-cover" />
                    </button>
                )}

                {/* Bubble */}
                <div className={cn(
                    "relative rounded-2xl px-4 py-2 font-mono text-sm",
                    "border transition-all",
                    isSent
                        ? "bg-green-900/30 border-green-500/50 text-green-100"
                        : "bg-gray-900/60 border-green-900/40 text-gray-100"
                )}>
                    {/* Sender name (for received messages) */}
                    {!isSent && (
                        <div className="text-xs text-green-500 mb-1 font-medium">
                            {isAnonymous ? senderName : senderName}
                        </div>
                    )}

                    {/* Media content */}
                    {(mediaUrl || gifUrl) && (
                        <div className="mb-2 rounded-lg overflow-hidden max-h-48 cursor-pointer"
                            onClick={() => handleMediaClick(mediaUrl || gifUrl!, mediaType || 'gif')}>
                            {mediaType === 'video' ? (
                                <video
                                    src={mediaUrl}
                                    className="max-w-full max-h-48 object-cover rounded-lg"
                                    muted
                                    playsInline
                                />
                            ) : (
                                <img
                                    src={mediaUrl || gifUrl}
                                    alt="Media"
                                    className="max-w-full max-h-48 object-cover rounded-lg"
                                    loading="lazy"
                                />
                            )}
                        </div>
                    )}

                    {/* Voice message */}
                    {voiceUrl && (
                        <div className="flex items-center gap-2 mb-2 bg-black/30 rounded-full px-3 py-2">
                            <button
                                onClick={toggleAudio}
                                className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-500 transition-colors"
                            >
                                {isPlaying ? <Pause className="w-4 h-4 text-black" /> : <Play className="w-4 h-4 text-black ml-0.5" />}
                            </button>
                            <div className="flex-1 h-1 bg-green-900/50 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: isPlaying ? '100%' : '0%', transition: 'width 1s linear' }} />
                            </div>
                            <span className="text-xs text-gray-400">{voiceDuration ? `${Math.round(voiceDuration)}s` : '0s'}</span>
                            <audio ref={audioRef} src={voiceUrl} preload="metadata" />
                        </div>
                    )}

                    {/* Text content */}
                    {displayContent && (
                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {displayContent}
                        </div>
                    )}

                    {/* Expand/collapse for long messages */}
                    {isLongMessage && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="flex items-center gap-1 text-xs text-green-400 mt-2 hover:text-green-300"
                        >
                            {isExpanded ? (
                                <><ChevronUp className="w-3 h-3" /> Show less</>
                            ) : (
                                <><ChevronDown className="w-3 h-3" /> Show more</>
                            )}
                        </button>
                    )}

                    {/* Timestamp & status & delete */}
                    <div className={cn(
                        "flex items-center gap-1 mt-1",
                        isSent ? "justify-end" : "justify-start"
                    )}>
                        <span className="text-[10px] text-gray-500">{formatTime(timestamp)}</span>
                        {isSent && status && (
                            <span className="text-gray-500">
                                {status === 'sending' && <span className="w-3 h-3 animate-pulse">●</span>}
                                {status === 'sent' && <Check className="w-3 h-3" />}
                                {status === 'delivered' && <CheckCheck className="w-3 h-3" />}
                            </span>
                        )}
                        {/* Delete button for admins or message sender */}
                        {onDelete && (isSent || isAdmin) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(id); }}
                                className="ml-1 p-1 text-gray-600 hover:text-red-500 transition-colors opacity-50 hover:opacity-100"
                                title="Delete message"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Fullscreen Media Viewer */}
            {showFullscreen && fullscreenMedia && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
                    onClick={() => setShowFullscreen(false)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white"
                        onClick={() => setShowFullscreen(false)}
                    >
                        <X className="w-6 h-6" />
                    </button>
                    {fullscreenMedia.type === 'video' ? (
                        <video
                            src={fullscreenMedia.url}
                            className="max-w-full max-h-full object-contain"
                            controls
                            autoPlay
                        />
                    ) : (
                        <img
                            src={fullscreenMedia.url}
                            alt="Fullscreen"
                            className="max-w-full max-h-full object-contain"
                        />
                    )}
                </div>
            )}
        </>
    );
}
