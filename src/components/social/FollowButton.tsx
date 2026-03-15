import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FollowButtonProps {
    targetUserId: string;
    targetUsername: string;
}

export default function FollowButton({ targetUserId, targetUsername }: FollowButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkFollowStatus();
    }, [user, targetUserId]);

    const checkFollowStatus = async () => {
        if (!user || user.id === targetUserId) return;

        try {
            const { data, error } = await supabase
                .from("follows")
                .select("*")
                .eq("follower_id", user.id)
                .eq("following_id", targetUserId)
                .maybeSingle();

            if (error) {
                console.error("Error checking follow status:", error);
                setIsFollowing(false);
                return;
            }

            setIsFollowing(!!data);
        } catch (error) {
            console.error("Error checking follow status:", error);
            setIsFollowing(false);
        }
    };

    const handleFollow = async () => {
        if (!user) {
            toast({
                title: "Login required",
                description: "Please login to follow users",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);
        try {
            if (isFollowing) {
                // Unfollow
                const { error } = await supabase
                    .from("follows")
                    .delete()
                    .eq("follower_id", user.id)
                    .eq("following_id", targetUserId);

                if (error) throw error;
                setIsFollowing(false);

                toast({
                    title: "Unfollowed",
                    description: `You unfollowed ${targetUsername}`,
                });
            } else {
                // Follow
                const { error } = await supabase
                    .from("follows")
                    .insert({
                        follower_id: user.id,
                        following_id: targetUserId,
                    });

                if (error) throw error;
                setIsFollowing(true);

                // Create notification
                await supabase.from("notifications").insert({
                    user_id: targetUserId,
                    type: "follow",
                    content: {
                        follower: user.username || "Someone",
                        followerUsername: user.username,
                    },
                });

                toast({
                    title: "Following",
                    description: `You are now following ${targetUsername}`,
                });
            }
        } catch (error) {
            console.error("Error toggling follow:", error);
            toast({
                title: "Error",
                description: "Failed to update follow status",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Don't show button for own profile
    if (!user || user.id === targetUserId) {
        return null;
    }

    return (
        <Button
            onClick={handleFollow}
            disabled={loading}
            variant={isFollowing ? "outline" : "default"}
            size="sm"
            className={isFollowing ? "ascii-box" : "ascii-box bg-ascii-highlight text-black hover:bg-ascii-highlight/90"}
        >
            {isFollowing ? (
                <>
                    <Check className="w-4 h-4 mr-2" />
                    Followed
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
