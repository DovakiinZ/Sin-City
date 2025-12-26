import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface SessionData {
    id: string;
    otherUserId: string;
    otherUserName: string;
    otherUserAvatar?: string;
    avatarSeed?: string;
    lastMessage: string | null;
    lastMessageType?: 'text' | 'image' | 'video' | 'gif' | 'voice';
    lastMessageTime: string;
    unreadCount: number;
    isOnline?: boolean;
    lastSeen?: string;
    isAnonymous?: boolean;
}

interface SessionItemProps {
    session: SessionData;
    isActive?: boolean;
    onClick: () => void;
}

export default function SessionItem({ session, isActive, onClick }: SessionItemProps) {
    const avatarUrl = session.otherUserAvatar || (session.avatarSeed
        ? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${session.avatarSeed}`
        : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${session.otherUserName}`);

    const formatTime = (ts: string) => {
        const date = new Date(ts);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const getMessagePreview = () => {
        if (!session.lastMessage && !session.lastMessageType) return 'No messages yet';

        switch (session.lastMessageType) {
            case 'image': return '📷 [IMAGE]';
            case 'video': return '🎬 [VIDEO]';
            case 'gif': return '🎭 [GIF]';
            case 'voice': return '🎤 [VOICE]';
            default: return session.lastMessage || 'No messages yet';
        }
    };

    // Presence dot color
    const presenceColor = session.isOnline ? 'bg-green-500' : 'bg-gray-600';

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                "hover:bg-green-900/20 border-b border-green-900/20",
                isActive && "bg-green-900/30"
            )}
        >
            {/* Avatar with presence dot */}
            <div className="relative flex-shrink-0">
                <Link
                    to={session.isAnonymous ? '#' : `/user/${session.otherUserName}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block"
                >
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-800 hover:ring-2 hover:ring-green-500/50 transition-all">
                        <img
                            src={avatarUrl}
                            alt={session.otherUserName}
                            className="w-full h-full object-cover"
                        />
                    </div>
                </Link>

                {/* Presence indicator */}
                <div className={cn(
                    "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-900",
                    presenceColor
                )} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <Link
                        to={session.isAnonymous ? '#' : `/user/${session.otherUserName}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-sm text-green-400 truncate hover:text-green-300"
                    >
                        {session.otherUserName}
                        {session.isAnonymous && (
                            <span className="ml-1 text-[10px] text-gray-500">🎭</span>
                        )}
                    </Link>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">
                        {formatTime(session.lastMessageTime)}
                    </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400 truncate">
                        {getMessagePreview()}
                    </p>

                    {/* Unread badge */}
                    {session.unreadCount > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 bg-green-600 rounded-full text-[10px] font-medium text-black flex items-center justify-center">
                            {session.unreadCount > 99 ? '99+' : session.unreadCount}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}
