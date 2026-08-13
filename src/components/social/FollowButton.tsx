import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus, Check, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFollow } from "@/hooks/useFollow";

interface FollowButtonProps {
    targetUserId: string;
    targetUsername: string;
}

export default function FollowButton({ targetUserId, targetUsername }: FollowButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const { outgoing, busy, requestFollow, unfollow } = useFollow(targetUserId);

    const handleClick = async () => {
        if (!user) {
            toast({
                title: "Login required",
                description: "Please login to follow users",
                variant: "destructive",
            });
            return;
        }

        if (outgoing === "accepted") {
            if (await unfollow()) {
                toast({ title: "Unfollowed", description: `You unfollowed ${targetUsername}` });
            }
            return;
        }

        if (outgoing === "pending") {
            if (await unfollow()) {
                toast({
                    title: "Request cancelled",
                    description: `Your follow request to ${targetUsername} was withdrawn`,
                });
            }
            return;
        }

        if (await requestFollow()) {
            toast({
                title: "Request sent",
                description: `${targetUsername} has to approve before you can message them`,
            });
        } else {
            toast({
                title: "Error",
                description: "Failed to send follow request",
                variant: "destructive",
            });
        }
    };

    // Don't show button for own profile
    if (!user || user.id === targetUserId) {
        return null;
    }

    return (
        <Button
            onClick={handleClick}
            disabled={busy}
            variant={outgoing === "none" ? "default" : "outline"}
            size="sm"
            title={outgoing === "pending" ? "Waiting for approval - click to cancel" : undefined}
            className={outgoing === "none"
                ? "ascii-box bg-ascii-highlight text-black hover:bg-ascii-highlight/90"
                : "ascii-box"}
        >
            {outgoing === "accepted" ? (
                <>
                    <Check className="w-4 h-4 mr-2" />
                    Following
                </>
            ) : outgoing === "pending" ? (
                <>
                    <Clock className="w-4 h-4 mr-2" />
                    Requested
                </>
            ) : (
                <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Follow
                </>
            )}
        </Button>
    );
}
