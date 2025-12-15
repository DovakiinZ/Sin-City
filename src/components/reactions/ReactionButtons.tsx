import { useAuth } from "@/context/AuthContext";
import { useReactions, toggleReaction } from "@/hooks/useReactions";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { ThumbsUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Link } from "react-router-dom";

interface ReactionButtonsProps {
    postId: string;
}

interface LikerInfo {
    userId: string;
    username: string;
}

export default function ReactionButtons({ postId }: ReactionButtonsProps) {
    const { user } = useAuth();
    const { reactions, counts, loading } = useReactions(postId);
    const { toast } = useToast();
    const [toggling, setToggling] = useState(false);
    const [likers, setLikers] = useState<LikerInfo[]>([]);

    // Fetch usernames of people who liked - only for logged-in users
    useEffect(() => {
        const fetchLikerUsernames = async () => {
            // Don't fetch liker info for anonymous users
            if (!user) {
                setLikers([]);
                return;
            }

            const likeReactions = reactions.filter(r => r.reaction_type === "like" && r.user_id);
            if (likeReactions.length === 0) {
                setLikers([]);
                return;
            }

            const userIds = likeReactions.map(r => r.user_id).filter(Boolean);

            try {
                const { data } = await supabase
                    .from("profiles")
                    .select("id, username")
                    .in("id", userIds);

                if (data) {
                    setLikers(data.map(p => ({
                        userId: p.id,
                        username: p.username || "anonymous",
                    })));
                }
            } catch (error) {
                console.error("Error fetching liker usernames:", error);
            }
        };

        fetchLikerUsernames();
    }, [reactions, user]);

    const handleLike = async () => {
        if (!user) {
            toast({
                title: "Error",
                description: "You must be logged in to like",
                variant: "destructive",
            });
            return;
        }

        setToggling(true);
        try {
            const result = await toggleReaction(postId, user.id, "like");

            toast({
                title: result.action === "added" ? "Liked!" : "Like removed",
                description: result.action === "added" ? "You liked this post" : "You unliked this post",
            });
        } catch (error) {
            console.error("Error toggling like:", error);
            toast({
                title: "Error",
                description: "Failed to update like",
                variant: "destructive",
            });
        } finally {
            setToggling(false);
        }
    };

    const userLiked = reactions.some((r) => r.user_id === user?.id && r.reaction_type === "like");
    const likeCount = counts.find((c) => c.reaction_type === "like")?.count || 0;

    // Render clickable "liked by" text
    const renderLikedBy = () => {
        if (likers.length === 0) return null;

        if (likers.length === 1) {
            return (
                <span>
                    Liked by{" "}
                    <Link to={`/user/${likers[0].username}`} className="text-green-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                        @{likers[0].username}
                    </Link>
                </span>
            );
        }

        if (likers.length === 2) {
            return (
                <span>
                    Liked by{" "}
                    <Link to={`/user/${likers[0].username}`} className="text-green-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                        @{likers[0].username}
                    </Link>
                    {" "}and{" "}
                    <Link to={`/user/${likers[1].username}`} className="text-green-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                        @{likers[1].username}
                    </Link>
                </span>
            );
        }

        return (
            <span>
                Liked by{" "}
                <Link to={`/user/${likers[0].username}`} className="text-green-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                    @{likers[0].username}
                </Link>
                {" "}and {likers.length - 1} others
            </span>
        );
    };

    if (loading) {
        return <div className="ascii-dim text-xs">Loading...</div>;
    }

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
                <button
                    onClick={handleLike}
                    disabled={toggling}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 text-sm border transition-all
                        ${userLiked
                            ? "border-green-400 bg-green-600/20 text-green-400"
                            : "border-green-600 hover:border-green-400 hover:bg-green-600/10"
                        }
                        ${toggling ? "opacity-50" : ""}
                    `}
                    title={userLiked ? "Unlike" : "Like"}
                >
                    <ThumbsUp className={`w-4 h-4 ${userLiked ? "fill-green-400" : ""}`} />
                    <span>{likeCount}</span>
                    <span className="text-xs">{userLiked ? "Liked" : "Like"}</span>
                </button>
            </div>
            {/* Only show who liked for logged-in users */}
            {user && likers.length > 0 && (
                <div className="text-xs text-green-600 ml-1">
                    {renderLikedBy()}
                </div>
            )}
        </div>
    );
}
