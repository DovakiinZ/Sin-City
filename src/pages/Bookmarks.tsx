import { useAuth } from "@/context/AuthContext";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { listPostsFromDb, type DbPost } from "@/data/posts";

export default function Bookmarks() {
    const { user } = useAuth();
    const { bookmarks, loading } = useBookmarks(user?.id);
    const [posts, setPosts] = useState<DbPost[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);

    useEffect(() => {
        const loadBookmarkedPosts = async () => {
            if (bookmarks.length === 0) {
                setPosts([]);
                setLoadingPosts(false);
                return;
            }

            try {
                const result = await listPostsFromDb({ limit: 500 }); // Get all posts to filter bookmarked ones
                const bookmarkedPostIds = bookmarks.map((b) => b.post_id);
                const filtered = result.posts.filter((p) => bookmarkedPostIds.includes(p.id || ""));
                setPosts(filtered);
            } catch (error) {
                console.error("Error loading bookmarked posts:", error);
            } finally {
                setLoadingPosts(false);
            }
        };

        loadBookmarkedPosts();
    }, [bookmarks]);

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-4xl mx-auto">
                    <BackButton />
                    <div className="ascii-box p-8 text-center mt-4">
                        <div className="ascii-highlight text-xl mb-4">Login Required</div>
                        <div className="ascii-dim mb-4">You must be logged in to view bookmarks</div>
                        <Link to="/login" className="ascii-nav-link hover:ascii-highlight">
                            → Log in
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <BackButton />

                <div className="ascii-box p-6">
                    <pre className="ascii-highlight text-xl mb-4">
                        {`╔═══════════════════════════════════════════════════════════════╗
║                       BOOKMARKS                               ║
╚═══════════════════════════════════════════════════════════════╝`}
                    </pre>

                    {loading || loadingPosts ? (
                        <div className="text-center py-12 ascii-dim">
                            Loading bookmarks...
                        </div>
                    ) : posts.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="ascii-dim text-lg mb-4">No bookmarks yet</div>
                            <div className="ascii-text text-sm mb-4">
                                Bookmark posts to save them for later
                            </div>
                            <Link to="/posts" className="ascii-nav-link hover:ascii-highlight">
                                → Browse posts
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="ascii-dim text-sm mb-6">
                                {posts.length} {posts.length === 1 ? "bookmark" : "bookmarks"}
                            </div>

                            <div className="space-y-6">
                                {posts.map((post) => (
                                    <div
                                        key={post.id}
                                        className="border-l-2 border-ascii-border pl-4 py-2"
                                    >
                                        <Link
                                            to={`/post/${post.id}`}
                                            className="ascii-highlight text-lg hover:underline block mb-2"
                                        >
                                            {post.title}
                                        </Link>

                                        <div className="ascii-dim text-xs mb-3">
                                            by {post.author_name || "Anonymous"} •{" "}
                                            {new Date(post.created_at || "").toLocaleDateString()}
                                        </div>

                                        {post.content && (
                                            <div className="ascii-text text-sm line-clamp-3">
                                                {post.content.substring(0, 200)}...
                                            </div>
                                        )}

                                        <Link
                                            to={`/post/${post.id}`}
                                            className="ascii-nav-link text-sm hover:ascii-highlight mt-2 inline-block"
                                        >
                                            Read more →
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
