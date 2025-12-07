import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import BackButton from "@/components/BackButton";
import CommentList from "@/components/comments/CommentList";
import ReactionBar from "@/components/reactions/ReactionBar";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import ShareButtons from "@/components/sharing/ShareButtons";
import { listPostsFromDb } from "@/data/posts";
import { estimateReadTime } from "@/lib/markdown";

type Post = {
    title: string;
    date: string;
    content: string;
    slug: string;
    author?: string;
    tags?: string[];
};

export default function PostDetail() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadPost = async () => {
            try {
                setLoading(true);

                // Try to load from database
                const dbPosts = await listPostsFromDb();
                const dbPost = dbPosts.find((p) => p.slug === slug || p.id === slug || p.title === slug);

                if (dbPost) {
                    setPost({
                        title: dbPost.title,
                        date: dbPost.created_at ? new Date(dbPost.created_at).toISOString().split("T")[0] : "",
                        content: dbPost.content || "",
                        slug: dbPost.id || slug || "",
                        author: dbPost.author_name || undefined,
                    });
                    return;
                }

                // Try to load from markdown files
                const res = await fetch(`/posts/${slug}.md`);
                if (res.ok) {
                    const text = await res.text();
                    const { data, content } = matter(text);
                    setPost({
                        title: String(data.title || slug),
                        date: String(data.date || ""),
                        content,
                        slug: slug || "",
                        author: data.author ? String(data.author) : undefined,
                        tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
                    });
                } else {
                    setPost(null);
                }
            } catch (error) {
                console.error("Error loading post:", error);
                setPost(null);
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            loadPost();
        }
    }, [slug]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-4xl mx-auto">
                    <div className="ascii-box p-8 text-center">
                        <div className="ascii-highlight text-xl mb-2">Loading post...</div>
                        <div className="ascii-dim">Please wait</div>
                    </div>
                </div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-4xl mx-auto">
                    <BackButton />
                    <div className="ascii-box p-8 text-center mt-4">
                        <div className="text-red-400 text-xl mb-2">Post not found</div>
                        <div className="ascii-dim mb-4">The requested post does not exist</div>
                        <button
                            onClick={() => navigate("/posts")}
                            className="ascii-nav-link hover:ascii-highlight"
                        >
                            ← Back to posts
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const readTime = estimateReadTime(post.content);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <BackButton />

                <div className="ascii-box p-6">
                    <pre className="ascii-highlight text-2xl mb-4">{post.title}</pre>

                    <div className="ascii-dim text-xs mb-6 flex flex-wrap gap-3">
                        {post.date && <span>{post.date}</span>}
                        {post.author && <span>by {post.author}</span>}
                        <span>{readTime} min read</span>
                    </div>

                    {post.tags && post.tags.length > 0 && (
                        <div className="mb-6 flex flex-wrap gap-2">
                            {post.tags.map((tag) => (
                                <span key={tag} className="ascii-box px-2 py-1 text-xs">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="prose prose-invert max-w-none mb-8">
                        <div dangerouslySetInnerHTML={{ __html: post.content }} />
                    </div>

                    {/* Reactions & Bookmark */}
                    <div className="mt-8 pt-6 border-t border-ascii-border flex items-center justify-between flex-wrap gap-4">
                        <ReactionBar postId={post.slug} />
                        <BookmarkButton postId={post.slug} />
                    </div>

                    {/* Sharing */}
                    <ShareButtons title={post.title} slug={post.slug} content={post.content} />
                </div>

                {/* Comments */}
                <CommentList postId={post.slug} />

                <div className="text-center">
                    <button
                        onClick={() => navigate("/posts")}
                        className="ascii-nav-link hover:ascii-highlight"
                    >
                        ← Back to all posts
                    </button>
                </div>
            </div>
        </div>
    );
}
