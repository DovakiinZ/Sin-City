import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface UserAvatarWithStatusProps {
    profile: {
        avatar_url?: string | null;
        display_name?: string | null;
        last_seen?: string | null;
        username?: string | null;
    } | null;
    className?: string;
    showStatus?: boolean;
}

export function UserAvatarWithStatus({ profile, className, showStatus = true }: UserAvatarWithStatusProps) {
    if (!profile) return <Avatar className={className} />;

    const now = new Date();
    const lastSeen = profile.last_seen ? new Date(profile.last_seen) : null;

    let status: 'online' | 'recent' | 'offline' = 'offline';
    let statusText = "Offline";

    if (lastSeen) {
        const diffMinutes = (now.getTime() - lastSeen.getTime()) / 1000 / 60;
        if (diffMinutes < 1) { // 1 minute threshold for "Active Now"
            status = 'online';
            statusText = "Active now";
        } else if (diffMinutes < 30) {
            status = 'recent';
            statusText = `Active ${Math.floor(diffMinutes)}m ago`;
        } else {
            status = 'offline';
            statusText = lastSeen ? `Active ${formatDistanceToNow(lastSeen, { addSuffix: true })}` : "Inactive";
        }
    }

    const ringColor = {
        online: "ring-2 ring-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse-slow",
        recent: "ring-2 ring-blue-500/70",
        offline: "ring-2 ring-gray-700/50"
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="relative inline-block">
                        <Avatar className={cn(
                            "transition-all duration-300",
                            showStatus && ringColor[status],
                            className
                        )}>
                            <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || profile.username || "User"} className="object-cover" />
                            <AvatarFallback className="bg-green-900/30 text-green-400 font-medium border border-green-700/50">
                                {(profile.display_name || profile.username || "U")[0].toUpperCase()}
                            </AvatarFallback>
                        </Avatar>

                        {/* Mobile-friendly indicator dot if needed, but ring is primary */}
                    </div>
                </TooltipTrigger>
                <TooltipContent className="bg-black border border-green-900 text-xs font-mono text-green-400">
                    {statusText}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
