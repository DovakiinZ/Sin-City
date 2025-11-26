import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import ReactionButton from "./ReactionButton";

type ReactionType = "like" | "love" | "fire" | "hundred";

interface ReactionCounts {
    like: number;
    love: number;
    fire: number;
    hundred: number;
}

interface UserReactions {
    like: boolean;
    love: boolean;
    fire: boolean;
    hundred: boolean;
}

interface ReactionBarProps {
    postId: string;
}

export default function ReactionBar({ postId }: ReactionBarProps) {
    const { user } = useAuth();
    const [counts, setCounts] = useState<ReactionCounts>({
        like: 0,
        love: 0,
        fire: 0,
        hundred: 0,
    });
    const [userReactions, setUserReactions] = useState<UserReactions>({
        like: false,
        love: false,
        fire: false,
        hundred: false,
    });
    const [loading, setLoading] = useState(true);

    const loadReactions = async () => {
        try {
            // Get all reactions for this post
            const { data: allReactions, error } = await supabase
                .from("reactions")
                .select("reaction_type, user_id")
                .eq("post_id", postId);

            if (error) throw error;

            // Count reactions by type
            const newCounts: ReactionCounts = {
                like: 0,
                love: 0,
                fire: 0,
                hundred: 0,
            };

            const newUserReactions: UserReactions = {
                like: false,
                love: false,
                fire: false,
                hundred: false,
            };

            allReactions?.forEach((reaction) => {
                const type = reaction.reaction_type as ReactionType;
                newCounts[type]++;

                if (user && reaction.user_id === user.id) {
                    newUserReactions[type] = true;
                }
            });

            setCounts(newCounts);
            setUserReactions(newUserReactions);
        } catch (error) {
            console.error("Error loading reactions:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReactions();

        // Subscribe to real-time changes
        const channel = supabase
            .channel(`reactions:${postId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "reactions",
                    filter: `post_id=eq.${postId}`,
                },
                () => {
                    loadReactions();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [postId, user]);

    if (loading) {
        return (
            <div className="flex gap-2">
                <div className="h-8 w-16 bg-black/20 rounded animate-pulse" />
                <div className="h-8 w-16 bg-black/20 rounded animate-pulse" />
                <div className="h-8 w-16 bg-black/20 rounded animate-pulse" />
                <div className="h-8 w-16 bg-black/20 rounded animate-pulse" />
            </div>
        );
    }

    return (
        <div className="flex gap-2 flex-wrap">
            <ReactionButton
                postId={postId}
                reactionType="like"
                count={counts.like}
                hasReacted={userReactions.like}
                onReactionChange={loadReactions}
            />
            <ReactionButton
                postId={postId}
                reactionType="love"
                count={counts.love}
                hasReacted={userReactions.love}
                onReactionChange={loadReactions}
            />
            <ReactionButton
                postId={postId}
                reactionType="fire"
                count={counts.fire}
                hasReacted={userReactions.fire}
                onReactionChange={loadReactions}
            />
            <ReactionButton
                postId={postId}
                reactionType="hundred"
                count={counts.hundred}
                hasReacted={userReactions.hundred}
                onReactionChange={loadReactions}
            />
        </div>
    );
}
