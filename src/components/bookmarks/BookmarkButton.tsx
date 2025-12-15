import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { toggleBookmark, isBookmarked } from "@/hooks/useBookmarks";
import { useToast } from "@/hooks/use-toast";
import { Bookmark, BookmarkCheck } from "lucide-react";

interface BookmarkButtonProps {
    postId: string;
}

export default function BookmarkButton({ postId }: BookmarkButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [bookmarked, setBookmarked] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const checkBookmark = async () => {
            if (user?.id) {
                const result = await isBookmarked(user.id, postId);
                setBookmarked(result);
            }
        };
        checkBookmark();
    }, [user?.id, postId]);

    const handleToggle = async () => {
        if (!user) {
            toast({
                title: "Error",
                description: "You must be logged in to bookmark posts",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);
        try {
            const result = await toggleBookmark(user.id, postId);
            setBookmarked(result.action === "added");

            toast({
                title: result.action === "added" ? "Bookmarked!" : "Removed from bookmarks",
                description: result.action === "added"
                    ? "Post saved to your bookmarks"
                    : "Post removed from bookmarks",
            });
        } catch (error) {
            console.error("Error toggling bookmark:", error);
            toast({
                title: "Error",
                description: "Failed to update bookmark",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleToggle}
            disabled={loading}
            className={`
        ascii-box px-3 py-1 text-sm transition-all flex items-center gap-2
        ${bookmarked ? "ascii-highlight border-ascii-highlight" : "ascii-text"}
        ${loading ? "opacity-50" : "hover:ascii-highlight hover:scale-105"}
      `}
            title={bookmarked ? "Remove bookmark" : "Bookmark this post"}
        >
            {bookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            {bookmarked ? "Saved" : "Save"}
        </button>
    );
}
