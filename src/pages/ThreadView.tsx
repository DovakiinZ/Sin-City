import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import BackButton from "@/components/BackButton";
import PostCard from "@/components/PostCard";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import ShareButtons from "@/components/sharing/ShareButtons";
import { getThreadPosts, Post } from "@/hooks/useSupabasePosts";
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
                <div className="w-full max-w-3xl mx-auto">
                    <div className="bg-black/30 border border-green-700/50 rounded-lg p-8 text-center">
                        <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-3" />
                        <div className="text-gray-400 text-sm">Loading thread...</div>
                    </div>
                </div>
            </div>
        );
    }

    if (!posts.length) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-3xl mx-auto space-y-6">
                    <BackButton />
                    <div className="bg-black/30 border border-red-900/50 rounded-lg p-8 text-center">
                        <div className="text-red-400 text-xl mb-2 font-bold">Thread not found</div>
                        <div className="text-gray-500 mb-4">This thread doesn't exist or has been deleted</div>
                        <button
                            onClick={() => navigate("/posts")}
                            className="text-green-400 hover:text-green-300 text-sm"
                        >
                            ← Back to posts
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const firstPost = posts[0];

    // Transform posts into PostCard format
    const transformedPosts = posts.map((post, index) => {
        const profile = post.user_id ? authorProfiles[post.user_id] : null;
        const authorUsername = profile?.username || undefined;
        const authorAvatar = profile?.avatar_url || post.author_avatar || undefined;
        const displayAuthor = authorUsername || post.author_name || "Anonymous";

        const createdDate = post.created_at ? new Date(post.created_at) : null;
        const formattedDate = createdDate
            ? createdDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            })
            : '';

        return {
            slug: post.id,
            postId: post.id,
            title: post.title,
            content: post.content || '',
            date: formattedDate,
            rawDate: post.created_at,
            author: displayAuthor,
            authorAvatar: authorAvatar,
            authorUsername: authorUsername,
            userId: post.user_id,
            viewCount: post.view_count,
            attachments: (post.attachments as any[])?.map((a: any) => ({
                url: a.url || '',
                type: (String(a.type).toLowerCase() === 'music' ? 'music' : (String(a.type).toLowerCase().startsWith('video') ? 'video' : 'image')) as 'image' | 'video' | 'music'
            })).filter((a: any) => a.url) || undefined,
            isHtml: true,
            isFirstInThread: index === 0,
        };
    });

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-3xl mx-auto space-y-6">
                <BackButton />

                {/* Thread Header Badge */}
                <div className="flex items-center gap-3 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <span className="text-green-400 font-bold">📎 Thread</span>
                    <span className="text-gray-500 text-sm">{posts.length} posts</span>
                </div>

                {/* Thread Posts - Using unified PostCard */}
                <div className="space-y-4">
                    {transformedPosts.map((post, index) => (
                        <div key={post.slug} className="relative">
                            {/* Vertical connecting line between posts */}
                            {index < transformedPosts.length - 1 && (
                                <div
                                    className="absolute left-7 -bottom-4 w-0.5 h-4 bg-green-500/30"
                                    style={{ zIndex: 1 }}
                                />
                            )}

                            {/* Thread position badge */}
                            <div className="absolute -left-3 top-4 z-10 w-6 h-6 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center">
                                <span className="text-xs text-green-400 font-bold">{index + 1}</span>
                            </div>

                            <PostCard
                                post={post}
                                fullContent={true}
                                showComments={index === transformedPosts.length - 1} // Only show comments on last post
                            />
                        </div>
                    ))}
                </div>

                {/* Thread Footer - Bookmark & Share */}
                <div className="bg-black/30 border border-green-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <BookmarkButton postId={firstPost.id} />
                        <ShareButtons
                            title={`Thread by ${authorProfiles[firstPost.user_id || ""]?.username || firstPost.author_name || "Anonymous"}`}
                            slug={`thread/${threadId}`}
                            content={firstPost.content || ""}
                        />
                    </div>
                </div>

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
