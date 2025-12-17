import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getThreadPosts, Post } from "@/hooks/useSupabasePosts";

interface ThreadNavigationProps {
    threadId: string;
    currentPosition: number;
    total: number;
    currentPostId: string;
}

export default function ThreadNavigation({
    threadId,
    currentPosition,
    total,
    currentPostId
}: ThreadNavigationProps) {
    const [threadPosts, setThreadPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchThread = async () => {
            try {
                const posts = await getThreadPosts(threadId);
                setThreadPosts(posts);
            } catch (error) {
                console.error("Error fetching thread:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchThread();
    }, [threadId]);

    if (loading) {
        return (
            <div className="ascii-box p-3 ascii-dim text-sm">
                Loading thread...
            </div>
        );
    }

    const prevPost = threadPosts.find(p => p.thread_position === currentPosition - 1);
    const nextPost = threadPosts.find(p => p.thread_position === currentPosition + 1);

    return (
        <div className="ascii-box p-4 space-y-3">
            {/* Thread Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="ascii-highlight">📎 THREAD</span>
                    <span className="ascii-dim text-sm">[{currentPosition}/{total}]</span>
                </div>
            </div>

            {/* Thread Progress */}
            <div className="flex items-center gap-1">
                {threadPosts.map((post, index) => (
                    <Link
                        key={post.id}
                        to={`/post/${post.slug || post.id}`}
                        className={`flex-1 h-2 rounded transition-colors ${post.id === currentPostId
                                ? 'bg-green-500'
                                : 'bg-ascii-border hover:bg-green-500/50'
                            }`}
                        title={`${index + 1}. ${post.title || 'Post ' + (index + 1)}`}
                    />
                ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between gap-4">
                {prevPost ? (
                    <Link
                        to={`/post/${prevPost.slug || prevPost.id}`}
                        className="ascii-nav-link hover:ascii-highlight flex items-center gap-1 text-sm"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="truncate max-w-[150px]">
                            {prevPost.title || `Post ${currentPosition - 1}`}
                        </span>
                    </Link>
                ) : (
                    <div />
                )}

                {nextPost ? (
                    <Link
                        to={`/post/${nextPost.slug || nextPost.id}`}
                        className="ascii-nav-link hover:ascii-highlight flex items-center gap-1 text-sm"
                    >
                        <span className="truncate max-w-[150px]">
                            {nextPost.title || `Post ${currentPosition + 1}`}
                        </span>
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                ) : (
                    <div />
                )}
            </div>

            {/* Thread Posts List (collapsed) */}
            <details className="text-sm">
                <summary className="ascii-dim cursor-pointer hover:ascii-highlight">
                    View all {total} posts in thread
                </summary>
                <div className="mt-2 space-y-1 pl-4 border-l border-ascii-border">
                    {threadPosts.map((post, index) => (
                        <Link
                            key={post.id}
                            to={`/post/${post.slug || post.id}`}
                            className={`block py-1 ${post.id === currentPostId
                                    ? 'ascii-highlight'
                                    : 'ascii-dim hover:ascii-highlight'
                                }`}
                        >
                            {index + 1}. {post.title || `Post ${index + 1}`}
                        </Link>
                    ))}
                </div>
            </details>
        </div>
    );
}
