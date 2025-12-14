import { useState } from "react";
import { Bell, MessageSquare, Heart, UserPlus, AtSign, Reply } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function NotificationBell() {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case "comment":
                return <MessageSquare className="w-4 h-4 text-blue-400" />;
            case "reaction":
                return <Heart className="w-4 h-4 text-red-400" />;
            case "follow":
                return <UserPlus className="w-4 h-4 text-green-400" />;
            case "mention":
                return <AtSign className="w-4 h-4 text-yellow-400" />;
            case "reply":
                return <Reply className="w-4 h-4 text-purple-400" />;
            default:
                return <Bell className="w-4 h-4 text-gray-400" />;
        }
    };

    const getNotificationText = (notification: any) => {
        const { type, content } = notification;

        switch (type) {
            case "comment":
                return `${content.author} commented on "${content.postTitle}"`;
            case "reaction":
                return `${content.author} reacted ${content.reaction} to your post`;
            case "follow":
                return `${content.follower} started following you`;
            case "mention":
                return `${content.author} mentioned you in "${content.postTitle}"`;
            case "reply":
                return `${content.author} replied to your comment`;
            default:
                return "New notification";
        }
    };

    const handleNotificationClick = (notification: any) => {
        markAsRead(notification.id);

        // Navigate based on notification type
        if (notification.content.postSlug) {
            navigate(`/post/${notification.content.postSlug}`);
        } else if (notification.content.username) {
            navigate(`/user/${notification.content.username}`);
        }

        setOpen(false);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button className="relative p-2 hover:bg-green-900/20 rounded transition-colors border border-transparent hover:border-green-700">
                    <Bell className="w-5 h-5 text-green-400" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-80 max-h-96 overflow-y-auto bg-black border-2 border-green-700 shadow-lg shadow-green-900/20"
            >
                <div className="flex items-center justify-between p-3 border-b border-green-700">
                    <span className="text-green-400 font-mono font-bold">+-- NOTIFICATIONS --+</span>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            className="text-xs text-green-600 hover:text-green-400 font-mono"
                        >
                            [Mark all read]
                        </button>
                    )}
                </div>

                {notifications.length === 0 ? (
                    <div className="p-6 text-center text-green-600 font-mono">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No notifications yet
                    </div>
                ) : (
                    notifications.map((notification) => (
                        <DropdownMenuItem
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`cursor-pointer p-3 font-mono border-b border-green-900/50 hover:bg-green-900/20 focus:bg-green-900/20 ${!notification.read ? "bg-green-900/30 border-l-2 border-l-green-400" : ""
                                }`}
                        >
                            <div className="flex gap-3 w-full items-start">
                                <div className="mt-1">
                                    {getNotificationIcon(notification.type)}
                                </div>
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                    <p className={`text-sm ${!notification.read ? "text-green-300" : "text-green-500"}`}>
                                        {getNotificationText(notification)}
                                    </p>
                                    <span className="text-xs text-green-700">
                                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                    </span>
                                </div>
                                {!notification.read && (
                                    <div className="w-2 h-2 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                                )}
                            </div>
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
