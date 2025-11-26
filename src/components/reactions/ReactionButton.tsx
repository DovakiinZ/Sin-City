import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

type ReactionType = "like" | "love" | "fire" | "hundred";

interface ReactionButtonProps {
    postId: string;
    reactionType: ReactionType;
    count: number;
    hasReacted: boolean;
    onReactionChange: () => void;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
    like: "👍",
    love: "❤️",
    fire: "🔥",
    hundred: "💯",
};

export default function ReactionButton({
    postId,
    reactionType,
    count,
    hasReacted,
    onReactionChange,
}: ReactionButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleReaction = async () => {
        if (!user) {
            toast({
                title: "Login required",
                description: "Please login to react to posts",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);

        try {
            if (hasReacted) {
                // Remove reaction
                const { error } = await supabase
                    .from("reactions")
                    .delete()
                    .eq("post_id", postId)
                    .eq("user_id", user.id)
                    .eq("reaction_type", reactionType);

                if (error) throw error;
            } else {
                // Add reaction (or update if exists)
                const { error } = await supabase
                    .from("reactions")
                    .upsert(
                        {
                            post_id: postId,
                            user_id: user.id,
                            reaction_type: reactionType,
                        },
                        {
                            onConflict: "post_id,user_id",
                        }
                    );

                if (error) throw error;
            }

            onReactionChange();
        } catch (error: any) {
            console.error("Error updating reaction:", error);
            toast({
                title: "Error",
                description: "Failed to update reaction",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleReaction}
            disabled={isLoading}
            className={`
        flex items-center gap-1 px-3 py-1.5 rounded-md transition-all
        ${hasReacted
                    ? "bg-ascii-highlight/20 text-ascii-highlight border border-ascii-highlight"
                    : "bg-black/20 text-ascii-dim border border-ascii-border hover:bg-ascii-highlight/10 hover:border-ascii-highlight/50"
                }
        ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
        >
            <span className="text-lg">{REACTION_EMOJIS[reactionType]}</span>
            {count > 0 && (
                <span className="text-xs font-mono">{count}</span>
            )}
        </button>
    );
}
