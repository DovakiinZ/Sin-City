import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface NewPostsBadgeProps {
    className?: string;
}

const NewPostsBadge = ({ className }: NewPostsBadgeProps) => {
    const [newPostsCount, setNewPostsCount] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const lastCheckRef = useRef<string | null>(null);
    const initialLoadRef = useRef(true);

    // Get the latest post timestamp on initial load
    useEffect(() => {
        const getInitialTimestamp = async () => {
            const { data } = await supabase
                .from('posts')
                .select('created_at')
                .eq('draft', false)
                .order('created_at', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                lastCheckRef.current = data[0].created_at;
            }
            initialLoadRef.current = false;
        };

        getInitialTimestamp();
    }, []);

    // Poll for new posts every 30 seconds
    useEffect(() => {
        const checkForNewPosts = async () => {
            if (initialLoadRef.current || !lastCheckRef.current || isDismissed) return;

            const { data, count } = await supabase
                .from('posts')
                .select('id', { count: 'exact' })
                .eq('draft', false)
                .gt('created_at', lastCheckRef.current);

            if (count && count > 0) {
                setNewPostsCount(count);
                setIsVisible(true);
            }
        };

        const interval = setInterval(checkForNewPosts, 30000);
        return () => clearInterval(interval);
    }, [isDismissed]);

    const handleRefresh = useCallback(() => {
        // Scroll to top and reload
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
            window.location.reload();
        }, 300);
    }, []);

    const handleDismiss = useCallback(() => {
        setIsVisible(false);
        setIsDismissed(true);
        setNewPostsCount(0);
    }, []);

    if (!isVisible || newPostsCount === 0) return null;

    return (
        <div
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-top-4 duration-300 ${className || ''}`}
        >
            <div className="ascii-box bg-black/95 shadow-lg shadow-green-900/50 border-green-400">
                <pre className="ascii-highlight text-xs px-2 pt-1">
                    {`╔════════════════════════════════╗`}
                </pre>
                <div className="px-4 py-2 flex items-center gap-3">
                    <span className="text-yellow-400 animate-pulse">[!]</span>
                    <span className="ascii-text">
                        {newPostsCount} NEW POST{newPostsCount > 1 ? 'S' : ''}
                    </span>
                    <button
                        onClick={handleRefresh}
                        className="ascii-nav-link hover:ascii-highlight border border-green-600 px-2 py-0.5 text-xs"
                    >
                        REFRESH
                    </button>
                    <button
                        onClick={handleDismiss}
                        className="ascii-dim hover:ascii-highlight text-xs"
                        title="Dismiss"
                    >
                        [X]
                    </button>
                </div>
                <pre className="ascii-highlight text-xs px-2 pb-1">
                    {`╚════════════════════════════════╝`}
                </pre>
            </div>
        </div>
    );
};

export default NewPostsBadge;
