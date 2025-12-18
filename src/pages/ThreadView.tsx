import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import BackButton from "@/components/BackButton";
import CommentList from "@/components/comments/CommentList";
import ReactionButtons from "@/components/reactions/ReactionButtons";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import ShareButtons from "@/components/sharing/ShareButtons";
import MediaCarousel from "@/components/media/PostMediaCarousel";
import { getThreadPosts, Post } from "@/hooks/useSupabasePosts";
import { estimateReadTime } from "@/lib/markdown";
import { supabase } from "@/lib/supabase";

export default function ThreadView() {
    const { threadId } = useParams<{ threadId: string }>();
    const navigate = useNavigate();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [authorProfiles, setAuthorProfiles] = useState<Record<string, { username: string; avatar_url: string | null }>>({});

    useEffect(() => {
        const loadThread = async () => {
            if (!threadId) return;

            try {
                setLoading(true);
                const threadPosts = await getThreadPosts(threadId);
                setPosts(threadPosts);

                // Fetch author profiles (username + avatar) for display
                const userIds = [...new Set(threadPosts.map(p => p.user_id).filter(Boolean))];
                if (userIds.length > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url')
                        .in('id', userIds);

                    if (profiles) {
                        const profileMap: Record<string, { username: string; avatar_url: string | null }> = {};
                        profiles.forEach(p => {
                            profileMap[p.id] = { username: p.username, avatar_url: p.avatar_url };
                        });
                        setAuthorProfiles(profileMap);
                    }
                }
            } catch (error) {
                console.error("Error loading thread:", error);
            } finally {
                setLoading(false);
            }
        };

        loadThread();
    }, [threadId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-4xl mx-auto">
                    <div className="ascii-box p-8 text-center">
                        <div className="ascii-highlight text-xl mb-2">Loading thread...</div>
                        <div className="ascii-dim">Please wait</div>
                    </div>
                </div>
            </div>
        );
    }

    if (!posts.length) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-4xl mx-auto">
                    <BackButton />
                    <div className="ascii-box p-8 text-center mt-4">
                        <div className="text-red-400 text-xl mb-2">Thread not found</div>
                        <div className="ascii-dim mb-4">This thread doesn't exist or has been deleted</div>
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

    const firstPost = posts[0];
    const lastPost = posts[posts.length - 1];

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-4xl mx-auto space-y-0">
                <div className="mb-6">
                    <BackButton />
                </div>

                {/* Thread Header */}
                <div className="ascii-box p-4 mb-0 rounded-b-none border-b-0">
                    <div className="flex items-center gap-3">
                        <span className="ascii-highlight text-lg">📎 THREAD</span>
                        <span className="ascii-dim text-sm">{posts.length} posts</span>
                    </div>
                </div>

                {/* Thread Posts - Vertical Stack */}
                <div className="relative">
                    {posts.map((post, index) => {
                        const isFirst = index === 0;
                        const isLast = index === posts.length - 1;
                        const profile = post.user_id ? authorProfiles[post.user_id] : null;
                        const authorUsername = profile?.username;
                        const authorAvatar = profile?.avatar_url || post.author_avatar;
                        const displayAuthor = authorUsername || post.author_name || "Anonymous";
                        const readTime = estimateReadTime(post.content || "");

                        return (
                            <div key={post.id} className="relative">
                                {/* Vertical connecting line */}
                                {!isLast && (
                                    <div
                                        className="absolute left-8 top-full w-0.5 h-6 bg-green-500/30"
                                        style={{ zIndex: 1 }}
                                    />
                                )}

                                <div className={`ascii-box p-6 ${isFirst ? 'rounded-t-none' : ''
                                    } ${!isLast ? 'rounded-b-none border-b-0' : ''}`}>

                                    {/* Profile Picture */}
                                    <div className="flex items-start gap-4">
                                        <Link to={`/user/${authorUsername || displayAuthor}`} className="flex-shrink-0">
                                            {authorAvatar ? (
                                                <img
                                                    src={authorAvatar}
                                                    alt={displayAuthor}
                                                    className="w-12 h-12 rounded-full object-cover border border-ascii-border"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center ascii-highlight text-lg font-bold">
                                                    {displayAuthor.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </Link>

                                        <div className="flex-1 min-w-0">
                                            {/* Post Title (if exists) */}
                                            {post.title && (
                                                <h2 className="ascii-highlight text-xl mb-2">{post.title}</h2>
                                            )}

                                            {/* Post Meta */}
                                            <div className="ascii-dim text-xs mb-4 flex flex-wrap gap-3">
                                                <span>
                                                    by{" "}
                                                    <Link
                                                        to={`/user/${authorUsername || displayAuthor}`}
                                                        className="text-blue-400 hover:underline"
                                                    >
                                                        @{displayAuthor}
                                                    </Link>
                                                </span>
                                                {post.created_at && (
                                                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                                                )}
                                                <span>{readTime} min read</span>
                                            </div>

                                            {/* Media */}
                                            {post.attachments && (post.attachments as any[]).length > 0 && (
                                                <div className="mb-4">
                                                    <MediaCarousel media={post.attachments as { url: string; type: 'image' | 'video' }[]} />
                                                </div>
                                            )}

                                            {/* Content */}
                                            <div className="prose prose-invert max-w-none">
                                                <div dir="auto" dangerouslySetInnerHTML={{ __html: post.content || "" }} />
                                            </div>

                                            {/* Reactions per post */}
                                            <div className="mt-4 pt-4 border-t border-ascii-border/50 flex items-center gap-4">
                                                <ReactionButtons postId={post.id} />
                                                {post.view_count !== undefined && (
                                                    <div className="flex items-center gap-1 ascii-dim text-xs">
                                                        <Eye className="w-4 h-4" />
                                                        <span>{post.view_count}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Spacing between posts */}
                                {!isLast && <div className="h-6" />}
                            </div>
                        );
                    })}
                </div>

                {/* Thread Footer - Bookmark & Share */}
                <div className="ascii-box p-4 mt-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <BookmarkButton postId={firstPost.id} />
                        <ShareButtons
                            title={`Thread by ${authorProfiles[firstPost.user_id || ""]?.username || firstPost.author_name || "Anonymous"}`}
                            slug={`thread/${threadId}`}
                            content={firstPost.content || ""}
                        />
                    </div>
                </div>

                {/* Comments - for the whole thread */}
                <div className="mt-6">
                    <CommentList postId={firstPost.id} postAuthorId={firstPost.user_id} />
                </div>

                <div className="text-center mt-6">
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
