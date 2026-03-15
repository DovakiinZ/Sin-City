import { useState, useEffect, useCallback } from "react";
import { Heart, Bookmark, Share2, Trash2, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toggleReaction } from "@/hooks/useReactions";
import { supabase } from "@/lib/supabase";
import { deletePost, updatePost } from "@/hooks/useSupabasePosts";

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
    const [isAdmin, setIsAdmin] = useState(false);

    // Fetch initial state
    const fetchState = useCallback(async () => {
        try {
            // Get like count
            const { count } = await supabase
                .from('reactions')
                .select('*', { count: 'exact', head: true })
                .eq('post_id', postId)
                .eq('reaction_type', 'like');

            setLikeCount(count || 0);

            if (user) {
                // Check if user liked
                const { data: likeData } = await supabase
                    .from('reactions')
                    .select('id')
                    .eq('post_id', postId)
                    .eq('user_id', user.id)
                    .eq('reaction_type', 'like')
                    .maybeSingle();
                setIsLiked(!!likeData);

                // Check bookmark
                const { data: bookmarkData } = await supabase
                    .from('bookmarks')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('post_id', postId)
                    .maybeSingle();
                setIsBookmarked(!!bookmarkData);

                // Check Admin Status
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                if (profile?.role === 'admin') setIsAdmin(true);
            }
        } catch (error) {
            console.error('Error fetching state:', error);
        }
    }, [postId, user]);

    useEffect(() => {
        fetchState();
    }, [fetchState]);

    const handleLike = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!user) { toast({ title: "Login required", description: "Please login to like posts" }); return; }
        const wasLiked = isLiked;
        setIsLiked(!wasLiked);
        setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);
        setToggling(true);
        try {
            await toggleReaction(postId, user.id, "like");
        } catch (error) {
            setIsLiked(wasLiked);
            setLikeCount(prev => wasLiked ? prev + 1 : prev - 1);
            toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
        } finally {
            setToggling(false);
        }
    };

    const handleBookmark = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!user) { toast({ title: "Login required", description: "Please login to bookmark posts" }); return; }
        const wasBookmarked = isBookmarked;
        setIsBookmarked(!wasBookmarked);
        try {
            if (wasBookmarked) {
                await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('post_id', postId);
                toast({ title: "Removed bookmark", description: "Post removed from bookmarks" });
            } else {
                await supabase.from('bookmarks').insert([{ user_id: user.id, post_id: postId }]);
                toast({ title: "Bookmarked!", description: "Post saved to bookmarks" });
            }
        } catch (error) {
            setIsBookmarked(wasBookmarked);
            toast({ title: "Error", description: "Failed to update bookmark", variant: "destructive" });
        }
    };

    const handleShare = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        const shareUrl = `${window.location.origin}/post/${postSlug}`;
        if (navigator.share) {
            try { await navigator.share({ title: postTitle, url: shareUrl }); } catch { }
        } else {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link copied!", description: "Post link copied to clipboard" });
        }
    };

    const handleHide = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!isAdmin) return;
        try {
            await updatePost(postId, { hidden: true });
            toast({ title: "Post Hidden", description: "This post is now hidden." });
            window.location.reload(); // Simple refresh to update feed
        } catch (err) {
            toast({ title: "Error", description: "Failed to hide post", variant: "destructive" });
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!isAdmin) return;
        if (!confirm("Are you sure you want to PERMANENTLY delete this post?")) return;

        try {
            await deletePost(postId);
            toast({ title: "Post Deleted", description: "Post has been removed." });
            window.location.reload();
        } catch (err) {
            toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
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
                className={`ascii-box p-1.5 flex items-center gap-1 transition-colors ${isLiked ? 'text-red-400 bg-red-900/30' : 'text-green-400 hover:bg-green-600/30'} ${toggling ? 'opacity-50' : ''}`}
                title={isLiked ? 'Unlike' : 'Like'}
            >
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                {likeCount > 0 && <span className="text-xs">{likeCount}</span>}
            </button>

            <button
                onClick={handleBookmark}
                className={`ascii-box p-1.5 transition-colors ${isBookmarked ? 'text-yellow-400 bg-yellow-900/30' : 'text-green-400 hover:bg-green-600/30'}`}
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

            {isAdmin && (
                <>
                    <div className="w-px h-4 bg-green-900 mx-1" /> {/* Divider */}
                    <button
                        onClick={handleHide}
                        className="ascii-box p-1.5 text-orange-400 hover:bg-orange-900/30 transition-colors"
                        title="Admin: Hide Post"
                    >
                        <EyeOff className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleDelete}
                        className="ascii-box p-1.5 text-red-500 hover:bg-red-900/30 transition-colors"
                        title="Admin: Delete Post"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </>
            )}
        </div>
    );
};

export default QuickActions;
