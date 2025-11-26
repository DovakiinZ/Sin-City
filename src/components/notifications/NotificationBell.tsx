import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between p-2">
                    <span className="font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={markAllAsRead}
                            className="text-xs"
                        >
                            Mark all read
                        </Button>
                    )}
                </div>
                <DropdownMenuSeparator />

                {notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                        No notifications yet
                    </div>
                ) : (
                    notifications.map((notification) => (
                        <DropdownMenuItem
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`cursor-pointer p-3 ${!notification.read ? "bg-accent/50" : ""}`}
                        >
                            <div className="flex flex-col gap-1 w-full">
                                <p className="text-sm">{getNotificationText(notification)}</p>
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                </span>
                            </div>
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
