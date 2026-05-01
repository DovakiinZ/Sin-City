import { useState } from "react";
import { Bell, MessageSquare } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useConversations } from "@/hooks/useConversations";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function NotificationBell() {
    const { notifications, unreadCount: generalUnreadCount, markAsRead: markGeneralAsRead, markAllAsRead } = useNotifications();
    const { totalUnread: dmUnreadCount } = useUnreadCount();
    const { conversations, markAsRead: markDmAsRead } = useConversations();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const totalCombinedUnread = generalUnreadCount + dmUnreadCount;

    // Filter unread conversations for the list
    const unreadDmSessions = conversations.filter(c => (c.unread_count || 0) > 0);

    const getNotificationText = (notification: any) => {
        const { type, content } = notification;
        const name = content.likerUsername || content.followerUsername || content.author || content.senderUsername || "Someone";

        switch (type) {
            case "comment":
                return `@${name} commented on your post "${content.postTitle}"`;
            case "reaction":
                return `@${name} reacted ${content.reaction} to your post`;
            case "like":
                return `👍 @${name} liked your post "${content.postTitle}"`;
            case "follow":
                return `@${name} started following you`;
            case "mention":
                return `@${name} mentioned you in a post`;
            case "reply":
                return `@${name} replied to your comment`;
            case "dm_message":
                return (
                    <div className="flex flex-col">
                        <span>@{name} sent you a message</span>
                        <span className="text-gray-400 mt-1 italic">"{content.preview}"</span>
                    </div>
                );
            default:
                return "New notification";
        }
    };

    const handleNotificationClick = (notification: any) => {
        markGeneralAsRead(notification.id);

        // Navigate based on notification type
        if (notification.type === 'dm_message' && notification.content.conversationId) {
            navigate(`/chat?session=${notification.content.conversationId}`);
        } else if (notification.content.postSlug) {
            navigate(`/post/${notification.content.postSlug}`);
        } else {
            const username = notification.content.username ||
                notification.content.likerUsername ||
                notification.content.followerUsername ||
                (notification.type === 'mention' ? notification.content.author : null);

            if (username) {
                navigate(`/user/${username}`);
            }
        }

        setOpen(false);
    };

    const handleDmClick = (sessionId: string) => {
        markDmAsRead(sessionId);
        navigate(`/chat?session=${sessionId}`);
        setOpen(false);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button className="relative p-2 border border-green-700 hover:border-green-400 bg-black/70 transition-colors">
                    <Bell className="w-5 h-5 text-green-400" />
                    {totalCombinedUnread > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center font-mono px-1">
                            {totalCombinedUnread > 9 ? "9+" : totalCombinedUnread}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto bg-black border border-green-700 font-mono p-0">
                <div className="sticky top-0 z-10 bg-black flex items-center justify-between p-3 border-b border-green-700">
                    <span className="text-green-400 font-semibold">+-- Notifications --+</span>
                    {generalUnreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            className="text-xs text-green-600 hover:text-green-400 transition-colors"
                        >
                            Mark all read
                        </button>
                    )}
                </div>

                <div className="divide-y divide-green-700/50">
                    {/* DM Notifications */}
                    {unreadDmSessions.map((session) => (
                        <div
                            key={`dm-${session.id}`}
                            onClick={() => handleDmClick(session.id)}
                            className="cursor-pointer p-3 hover:bg-green-900/20 transition-colors bg-green-900/10 border-l-2 border-green-400"
                        >
                            <div className="flex items-start gap-2">
                                <MessageSquare className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-green-300 truncate">
                                        💬 New message from @{session.other_user?.username || 'Unknown'}
                                    </p>
                                    <span className="text-xs text-green-600">
                                        {session.last_activity_at ? formatDistanceToNow(new Date(session.last_activity_at), { addSuffix: true }) : 'Just now'}
                                    </span>
                                </div>
                                {session.unread_count && (
                                    <span className="bg-green-600 text-black text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                        {session.unread_count}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Regular Notifications */}
                    {notifications.length === 0 && unreadDmSessions.length === 0 ? (
                        <div className="p-6 text-center text-sm text-green-600">
                            No notifications yet
                        </div>
                    ) : (
                        notifications.map((notification) => (
                            <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`cursor-pointer p-3 hover:bg-green-900/20 transition-colors ${!notification.read ? "bg-green-900/10 border-l-2 border-green-400" : ""}`}
                            >
                                <div className="text-sm text-green-300">{getNotificationText(notification)}</div>
                                <span className="text-xs text-green-600">
                                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
