import { useAuth } from "@/context/AuthContext";
import { useReactions, toggleReaction, type Reaction } from "@/hooks/useReactions";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface ReactionButtonsProps {
    postId: string;
}

const REACTIONS: Array<{ type: Reaction["reaction_type"]; label: string }> = [
    { type: "+1", label: "+1" },
    { type: "!", label: "!" },
    { type: "*", label: "*" },
    { type: "#", label: "#" },
];

export default function ReactionButtons({ postId }: ReactionButtonsProps) {
    const { user } = useAuth();
    const { reactions, counts, loading } = useReactions(postId);
    const { toast } = useToast();
    const [toggling, setToggling] = useState<string | null>(null);

    const handleReaction = async (reactionType: Reaction["reaction_type"]) => {
        if (!user) {
            toast({
                title: "Error",
                description: "You must be logged in to react",
                variant: "destructive",
            });
            return;
        }

        setToggling(reactionType);
        try {
            const result = await toggleReaction(postId, user.uid, reactionType);

            toast({
                title: result.action === "added" ? "Reaction added!" : "Reaction removed",
                description: `${reactionType}`,
            });
        } catch (error) {
            console.error("Error toggling reaction:", error);
            toast({
                title: "Error",
                description: "Failed to update reaction",
                variant: "destructive",
            });
        } finally {
            setToggling(null);
        }
    };

    const getUserReaction = (reactionType: string) => {
        return reactions.find(
            (r) => r.user_id === user?.uid && r.reaction_type === reactionType
        );
    };

    const getCount = (reactionType: string) => {
        return counts.find((c) => c.reaction_type === reactionType)?.count || 0;
    };

    if (loading) {
        return <div className="ascii-dim text-xs">Loading reactions...</div>;
    }

    return (
        <div className="flex gap-2 items-center">
            <span className="ascii-dim text-xs">React:</span>
            {REACTIONS.map(({ type, label }) => {
                const count = getCount(type);
                const userReacted = !!getUserReaction(type);
                const isToggling = toggling === type;

                return (
                    <button
                        key={type}
                        onClick={() => handleReaction(type)}
                        disabled={isToggling}
                        className={`
              ascii-box px-3 py-1 text-sm transition-all
              ${userReacted ? "ascii-highlight border-ascii-highlight" : "ascii-text"}
              ${isToggling ? "opacity-50" : "hover:ascii-highlight hover:scale-110"}
            `}
                        title={`${label} (${count})`}
                    >
                        {label}
                        {count > 0 && (
                            <span className="ml-1 text-xs">
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
