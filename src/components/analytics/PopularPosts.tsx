import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPopularPosts, getTrendingPosts, type PopularPost, type TrendingPost } from "@/hooks/useSearch";

export default function PopularPosts() {
    const [popular, setPopular] = useState<PopularPost[]>([]);
    const [trending, setTrending] = useState<TrendingPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"popular" | "trending">("popular");

    useEffect(() => {
        const loadPosts = async () => {
            try {
                const [popularData, trendingData] = await Promise.all([
                    getPopularPosts(5),
                    getTrendingPosts(7, 5),
                ]);
                setPopular(popularData);
                setTrending(trendingData);
            } catch (error) {
                console.error("Error loading popular posts:", error);
            } finally {
                setLoading(false);
            }
        };

        loadPosts();
    }, []);

    const posts = activeTab === "popular" ? popular : trending;

    return (
        <div className="ascii-box p-4">
            <div className="flex gap-4 mb-4 border-b border-ascii-border pb-2">
                <button
                    onClick={() => setActiveTab("popular")}
                    className={`text-xs ${activeTab === "popular" ? "ascii-highlight" : "ascii-dim hover:ascii-text"
                        }`}
                >
                    [POPULAR]
                </button>
                <button
                    onClick={() => setActiveTab("trending")}
                    className={`text-xs ${activeTab === "trending" ? "ascii-highlight" : "ascii-dim hover:ascii-text"
                        }`}
                >
                    [TRENDING]
                </button>
            </div>

            {loading ? (
                <div className="ascii-dim text-xs text-center py-4">Loading...</div>
            ) : posts.length === 0 ? (
                <div className="ascii-dim text-xs text-center py-4">No posts yet</div>
            ) : (
                <div className="space-y-3">
                    {posts.map((post, index) => (
                        <div key={post.id} className="border-l-2 border-ascii-border pl-3">
                            <Link
                                to={`/post/${post.id}`}
                                className="ascii-text hover:ascii-highlight text-sm block mb-1"
                            >
                                [{index + 1}] {post.title}
                            </Link>
                            <div className="ascii-dim text-xs flex gap-3">
                                <span>👁 {post.view_count}</span>
                                <span>💬 {post.comment_count}</span>
                                <span>⚡ {post.reaction_count}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
