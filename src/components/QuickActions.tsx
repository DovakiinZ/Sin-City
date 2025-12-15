import { useState, useEffect, useCallback } from "react";
import { Heart, Bookmark, Share2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toggleReaction } from "@/hooks/useReactions";
import { supabase } from "@/lib/supabase";

interface QuickActionsProps {
    postId: string;
    postTitle: string;
    postSlug: string;
    className?: string;
}

const QuickActions = ({ postId, postTitle, postSlug, className }: QuickActionsProps) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [toggling, setToggling] = useState(false);

    // Fetch initial like state
    const fetchLikeState = useCallback(async () => {
        try {
            // Get like count
            const { count } = await supabase
                .from('reactions')
                .select('*', { count: 'exact', head: true })
                .eq('post_id', postId)
                .eq('reaction_type', 'like');

            setLikeCount(count || 0);

            // Check if user liked
            if (user) {
                const { data } = await supabase
                    .from('reactions')
                    .select('id')
                    .eq('post_id', postId)
                    .eq('user_id', user.id)
                    .eq('reaction_type', 'like')
                    .maybeSingle();

                setIsLiked(!!data);
            }
        } catch (error) {
            console.error('Error fetching like state:', error);
        }
    }, [postId, user]);

    // Fetch bookmark status
    const fetchBookmarkState = useCallback(async () => {
        if (!user) return;

        try {
            const { data } = await supabase
                .from('bookmarks')
                .select('id')
                .eq('user_id', user.id)
                .eq('post_id', postId)
                .maybeSingle();

            setIsBookmarked(!!data);
        } catch (error) {
            console.error('Error fetching bookmark state:', error);
        }
    }, [user, postId]);

    // Initial fetch
    useEffect(() => {
        fetchLikeState();
        fetchBookmarkState();
    }, [fetchLikeState, fetchBookmarkState]);

    const handleLike = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!user) {
            toast({ title: "Login required", description: "Please login to like posts" });
            return;
        }

        // Optimistic update
        const wasLiked = isLiked;
        setIsLiked(!wasLiked);
        setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);

        setToggling(true);
        try {
            const result = await toggleReaction(postId, user.id, "like");
            toast({
                title: result.action === "added" ? "Liked!" : "Like removed",
                description: result.action === "added" ? "You liked this post" : "You unliked this post"
            });
        } catch (error) {
            // Revert optimistic update on error
            setIsLiked(wasLiked);
            setLikeCount(prev => wasLiked ? prev + 1 : prev - 1);
            console.error("Error toggling like:", error);
            toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
        } finally {
            setToggling(false);
        }
    };

    const handleBookmark = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!user) {
            toast({ title: "Login required", description: "Please login to bookmark posts" });
            return;
        }

        // Optimistic update
        const wasBookmarked = isBookmarked;
        setIsBookmarked(!wasBookmarked);

        try {
            if (wasBookmarked) {
                await supabase
                    .from('bookmarks')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('post_id', postId);

                toast({ title: "Removed bookmark", description: "Post removed from bookmarks" });
            } else {
                await supabase
                    .from('bookmarks')
                    .insert([{ user_id: user.id, post_id: postId }]);

                toast({ title: "Bookmarked!", description: "Post saved to bookmarks" });
            }
        } catch (error) {
            // Revert on error
            setIsBookmarked(wasBookmarked);
            console.error("Error toggling bookmark:", error);
            toast({ title: "Error", description: "Failed to update bookmark", variant: "destructive" });
        }
    };

    const handleShare = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const shareUrl = `${window.location.origin}/post/${postSlug}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: postTitle,
                    url: shareUrl
                });
            } catch {
                // User cancelled or share failed
            }
        } else {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link copied!", description: "Post link copied to clipboard" });
        }
    };

    return (
        <div
            className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${className || ''}`}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                onClick={handleLike}
                disabled={toggling}
                className={`ascii-box p-1.5 flex items-center gap-1 transition-colors ${isLiked ? 'text-red-400 bg-red-900/30' : 'text-green-400 hover:bg-green-600/30'
                    } ${toggling ? 'opacity-50' : ''}`}
                title={`${isLiked ? 'Unlike' : 'Like'}`}
            >
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                {likeCount > 0 && <span className="text-xs">{likeCount}</span>}
            </button>

            <button
                onClick={handleBookmark}
                className={`ascii-box p-1.5 transition-colors ${isBookmarked ? 'text-yellow-400 bg-yellow-900/30' : 'text-green-400 hover:bg-green-600/30'
                    }`}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>

            <button
                onClick={handleShare}
                className="ascii-box p-1.5 text-green-400 hover:bg-green-600/30 transition-colors"
                title="Share"
            >
                <Share2 className="w-4 h-4" />
            </button>
        </div>
    );
};

export default QuickActions;
