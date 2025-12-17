import { useParams, useNavigate, Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import matter from "gray-matter";
import BackButton from "@/components/BackButton";
import CommentList from "@/components/comments/CommentList";
import ReactionButtons from "@/components/reactions/ReactionButtons";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import ShareButtons from "@/components/sharing/ShareButtons";
import MediaCarousel from "@/components/media/PostMediaCarousel";
import ThreadNavigation from "@/components/thread/ThreadNavigation";
import { listPostsFromDb } from "@/data/posts";
import { estimateReadTime } from "@/lib/markdown";
import { supabase } from "@/lib/supabase";

type Post = {
    title: string;
    date: string;
    content: string;
    slug: string;
    author?: string;
    authorId?: string;
    tags?: string[];
    viewCount?: number;
    attachments?: { url: string; type: 'image' | 'video' }[];
    threadId?: string;
    threadPosition?: number;
};

export default function PostDetail() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);
    const hasIncrementedView = useRef(false);
    const [authorUsername, setAuthorUsername] = useState<string | null>(null);
    const [threadTotal, setThreadTotal] = useState<number>(0);

    useEffect(() => {
        const loadPost = async () => {
            try {
                setLoading(true);

                // Try to load from database
                const dbPosts = await listPostsFromDb();
                const dbPost = dbPosts.find((p) => p.slug === slug || p.id === slug || p.title === slug);

                if (dbPost) {
                    // Get the author's username for the profile link
                    let fetchedUsername = null;
                    if (dbPost.user_id) {
                        const { data } = await supabase
                            .from('profiles')
                            .select('username')
                            .eq('id', dbPost.user_id)
                            .single();
                        if (data?.username) {
                            fetchedUsername = data.username;
                            setAuthorUsername(data.username);
                        }
                    }

                    // Check if post is part of a thread - redirect to ThreadView
                    if (dbPost.thread_id) {
                        const { count } = await supabase
                            .from('posts')
                            .select('*', { count: 'exact', head: true })
                            .eq('thread_id', dbPost.thread_id);
                        const threadTotalCount = count || 0;

                        // If thread has multiple posts, redirect to thread view
                        if (threadTotalCount > 1) {
                            navigate(`/thread/${dbPost.thread_id}`, { replace: true });
                            return;
                        }
                        setThreadTotal(threadTotalCount);
                    }

                    setPost({
                        title: dbPost.title,
                        date: dbPost.created_at ? new Date(dbPost.created_at).toISOString().split("T")[0] : "",
                        content: dbPost.content || "",
                        slug: dbPost.id || slug || "",
                        author: fetchedUsername || dbPost.author_name || undefined,
                        authorId: dbPost.user_id || undefined,
                        viewCount: (dbPost.view_count || 0) + 1,
                        attachments: dbPost.attachments as { url: string; type: 'image' | 'video' }[] || undefined,
                        threadId: dbPost.thread_id || undefined,
                        threadPosition: dbPost.thread_position || undefined,
                    });

                    // Increment view count (only once per page load)
                    if (!hasIncrementedView.current && dbPost.id) {
                        hasIncrementedView.current = true;
                        supabase.rpc('increment_post_views', { post_id_param: dbPost.id }).then(({ error }) => {
                            if (error) console.log('[PostDetail] Error incrementing views:', error);
                        });
                    }
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

                {/* Thread Navigation - show if post is part of a thread */}
                {post.threadId && post.threadPosition && threadTotal > 1 && (
                    <ThreadNavigation
                        threadId={post.threadId}
                        currentPosition={post.threadPosition}
                        total={threadTotal}
                        currentPostId={post.slug}
                    />
                )}

                <div className="ascii-box p-6">
                    {/* Thread indicator badge */}
                    {post.threadId && post.threadPosition && threadTotal > 1 && (
                        <div className="mb-4 flex items-center gap-2">
                            <span className="ascii-box px-2 py-1 text-xs bg-green-500/10 text-green-400 border-green-500/30">
                                📎 Thread [{post.threadPosition}/{threadTotal}]
                            </span>
                        </div>
                    )}

                    <pre className="ascii-highlight text-2xl mb-4">{post.title}</pre>

                    <div className="ascii-dim text-xs mb-6 flex flex-wrap gap-3">
                        {post.date && <span>{post.date}</span>}
                        {post.author && (
                            <span>
                                by{" "}
                                <Link
                                    to={`/user/${authorUsername || post.author}`}
                                    className="text-blue-400 hover:underline"
                                >
                                    @{authorUsername || post.author}
                                </Link>
                            </span>
                        )}
                        <span>{readTime} min read</span>
                        {post.viewCount !== undefined && (
                            <div className="flex items-center gap-1.5" title="Total Views">
                                <Eye className="w-4 h-4" />
                                <span>{post.viewCount} views</span>
                            </div>
                        )}
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

                    {/* Media Gallery - Carousel with arrows */}
                    {post.attachments && post.attachments.length > 0 && (
                        <MediaCarousel media={post.attachments as { url: string; type: 'image' | 'video' }[]} />
                    )}

                    <div className="prose prose-invert max-w-none mb-8">
                        <div dangerouslySetInnerHTML={{ __html: post.content }} />
                    </div>

                    {/* Reactions & Bookmark */}
                    <div className="mt-8 pt-6 border-t border-ascii-border flex items-center justify-between flex-wrap gap-4">
                        <ReactionButtons postId={post.slug} />
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
