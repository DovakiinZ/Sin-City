import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function NotificationBell() {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const getNotificationText = (notification: any) => {
        const { type, content } = notification;

        switch (type) {
            case "comment":
                return `${content.author} commented on your post "${content.postTitle}"`;
            case "reaction":
                return `${content.author} reacted ${content.reaction} to your post`;
            case "like":
                return `👍 ${content.author} liked your post "${content.postTitle}"`;
            case "follow":
                return `${content.follower} started following you`;
            case "mention":
                return `${content.author} mentioned you in a post`;
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
                <button className="relative p-2 border border-green-700 hover:border-green-400 bg-black/70 transition-colors">
                    <Bell className="w-5 h-5 text-green-400" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-mono">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto bg-black border border-green-700 font-mono">
                <div className="flex items-center justify-between p-3 border-b border-green-700">
                    <span className="text-green-400 font-semibold">+-- Notifications --+</span>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            className="text-xs text-green-600 hover:text-green-400 transition-colors"
                        >
                            Mark all read
                        </button>
                    )}
                </div>

                {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-green-600">
                        No notifications yet
                    </div>
                ) : (
                    <div className="divide-y divide-green-700/50">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`cursor-pointer p-3 hover:bg-green-900/20 transition-colors ${!notification.read ? "bg-green-900/10 border-l-2 border-green-400" : ""}`}
                            >
                                <p className="text-sm text-green-300">{getNotificationText(notification)}</p>
                                <span className="text-xs text-green-600">
                                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
