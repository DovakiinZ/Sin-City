import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import matter from "gray-matter";
import BackButton from "@/components/BackButton";
import PostCard from "@/components/PostCard";
import ThreadNavigation from "@/components/thread/ThreadNavigation";
import { listPostsFromDb } from "@/data/posts";
import { supabase } from "@/lib/supabase";

type Post = {
    slug: string;
    postId: string;
    title: string;
    content: string;
    date: string;
    rawDate?: string;
    author?: string;
    authorAvatar?: string;
    authorUsername?: string;
    userId?: string;
    viewCount?: number;
    attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
    isHtml?: boolean;
    threadId?: string;
    threadPosition?: number;
};

export default function PostDetail() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);
    const hasIncrementedView = useRef(false);
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
                    let fetchedAvatar = null;
                    if (dbPost.user_id) {
                        const { data } = await supabase
                            .from('profiles')
                            .select('username, avatar_url')
                            .eq('id', dbPost.user_id)
                            .single();
                        if (data?.username) {
                            fetchedUsername = data.username;
                        }
                        if (data?.avatar_url) {
                            fetchedAvatar = data.avatar_url;
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

                    const createdDate = dbPost.created_at ? new Date(dbPost.created_at) : null;
                    const formattedDate = createdDate
                        ? createdDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        })
                        : '';

                    setPost({
                        slug: dbPost.slug || dbPost.id || slug || '',
                        postId: dbPost.id || '',
                        title: dbPost.title,
                        content: dbPost.content || '',
                        date: formattedDate,
                        rawDate: dbPost.created_at || '',
                        author: fetchedUsername || dbPost.author_name || undefined,
                        authorAvatar: fetchedAvatar || dbPost.author_avatar || undefined,
                        authorUsername: fetchedUsername || undefined,
                        userId: dbPost.user_id || undefined,
                        viewCount: (dbPost.view_count || 0) + 1,
                        attachments: dbPost.attachments?.map((a: any) => ({
                            url: a.url || '',
                            type: (String(a.type).toLowerCase() === 'music' ? 'music' : (String(a.type).toLowerCase().startsWith('video') ? 'video' : 'image')) as 'image' | 'video' | 'music'
                        })).filter((a: any) => a.url) || undefined,
                        isHtml: true,
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
                        slug: slug || '',
                        postId: slug || '',
                        title: String(data.title || slug),
                        content,
                        date: String(data.date || ''),
                        author: data.author ? String(data.author) : undefined,
                        isHtml: false,
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
    }, [slug, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-3xl mx-auto">
                    <div className="bg-black/30 border border-green-700/50 rounded-lg p-8 text-center">
                        <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-3" />
                        <div className="text-gray-400 text-sm">Loading post...</div>
                    </div>
                </div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-3xl mx-auto space-y-6">
                    <BackButton />
                    <div className="bg-black/30 border border-red-900/50 rounded-lg p-8 text-center">
                        <div className="text-red-400 text-xl mb-2 font-bold">Post not found</div>
                        <div className="text-gray-500 mb-4">The requested post does not exist</div>
                        <button
                            onClick={() => navigate("/posts")}
                            className="text-green-400 hover:text-green-300 text-sm"
                        >
                            ← Back to all posts
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="w-full max-w-3xl mx-auto space-y-6">
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

                {/* UNIFIED POST LAYOUT - Uses PostCard with fullContent */}
                <PostCard
                    post={post}
                    fullContent={true}
                    showComments={true}
                />

                <div className="text-center pt-4">
                    <button
                        onClick={() => navigate("/posts")}
                        className="text-gray-500 hover:text-green-400 text-sm transition-colors"
                    >
                        ← Back to all posts
                    </button>
                </div>
            </div>
        </div>
    );
}
