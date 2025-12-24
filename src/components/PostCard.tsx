import { useState, useRef, useEffect, useMemo } from "react";
import { UserAvatarWithStatus } from "@/components/UserAvatarWithStatus";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Pin, Send, X, Eye, EyeOff, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useReactions, toggleReaction } from "@/hooks/useReactions";
import { useToast } from "@/hooks/use-toast";
import { createComment } from "@/hooks/useComments";
import { decodeHtml, stripHtml } from "@/lib/markdown";
import MediaCarousel from "@/components/media/PostMediaCarousel";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import CommentList from "@/components/comments/CommentList";
import { MusicMetadata } from "@/components/MusicCard";

interface PostCardProps {
    post: {
        slug: string;
        postId?: string; // actual database ID for comments
        title: string;
        content: string;
        date: string;
        rawDate?: string;
        author?: string;
        authorAvatar?: string;
        authorUsername?: string;
        authorLastSeen?: string; // New field for presence
        isPinned?: boolean;
        isHtml?: boolean;
        attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
        gif_url?: string;
        userId?: string;
        viewCount?: number;
        music_metadata?: MusicMetadata | null;  // Cached music metadata for fallback
    };
    fullContent?: boolean; // Show full content instead of preview
    showComments?: boolean; // Show comments section
    onTogglePin?: (postId: string, isPinned: boolean) => void; // Admin pin toggle
    onHide?: (postId: string) => void; // Admin hide post
    onDelete?: (postId: string) => void; // Admin delete post
    isAdmin?: boolean;
    isHidden?: boolean; // Track if post is hidden
}

export default function PostCard({
    post,
    fullContent = false,
    showComments = false,
    onTogglePin,
    onHide,
    onDelete,
    isAdmin = false,
    isHidden = false
}: PostCardProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();
    const postIdForReactions = post.postId || post.slug;
    const { reactions, counts, optimisticToggle } = useReactions(postIdForReactions);

    // Comment state
    const [showCommentInput, setShowCommentInput] = useState(false);
    const [showCommentsSection, setShowCommentsSection] = useState(showComments);
    const [commentText, setCommentText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [toggling, setToggling] = useState(false);
    const commentInputRef = useRef<HTMLTextAreaElement>(null);

    // Extract first image from content if no attachments
    const contentImage = useMemo(() => {
        if (post.attachments && post.attachments.length > 0) return null; // Prefer explicit attachments
        if (!post.content) return null;

        // Match HTML img src
        const imgMatch = post.content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch && imgMatch[1]) return imgMatch[1];

        // Match Markdown image
        const mdMatch = post.content.match(/!\[.*?\]\((.*?)\)/);
        if (mdMatch && mdMatch[1]) return mdMatch[1];

        return null;
    }, [post.content, post.attachments]);

    // Effective media to display in carousel
    const displayMedia = useMemo(() => {
        if (post.attachments && post.attachments.length > 0) return post.attachments;
        if (contentImage && !fullContent) {
            return [{ url: contentImage, type: 'image' as const }];
        }
        return null;
    }, [post.attachments, contentImage, fullContent]);

    // Calculate relative time
    const relativeTime = post.rawDate
        ? formatDistanceToNow(new Date(post.rawDate), { addSuffix: true })
        : post.date;

    // Check if user has liked
    const hasLiked = reactions.some(r => r.reaction_type === "like" && r.user_id === user?.id);
    const likeCount = counts.find(c => c.reaction_type === "like")?.count || 0;

    // Calculate read time
    const textContent = stripHtml(post.content);
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    const readMins = Math.max(1, Math.ceil(wordCount / 200));

    // Detect Arabic text for RTL alignment
    const isArabic = (text: string) => {
        const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
        return arabicRegex.test(text);
    };
    const titleIsArabic = isArabic(post.title);
    const contentIsArabic = isArabic(stripHtml(post.content));

    // Handle like toggle
    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) {
            toast({ title: "Login required", description: "Please login to like posts", variant: "destructive" });
            return;
        }
        if (toggling) return;

        setToggling(true);
        if (user?.id) {
            optimisticToggle(user.id, "like");
        }
        try {
            await toggleReaction(postIdForReactions, user.id, "like");
        } catch (error) {
            console.error("Error toggling like:", error);
        } finally {
            setToggling(false);
        }
    };

    // Handle comment submission
    const handleSubmitComment = async () => {
        if (!commentText.trim() || !user) return;

        setSubmitting(true);
        try {
            await createComment({
                post_id: post.postId || post.slug,
                user_id: user.id,
                author_name: user.username || "Anonymous",
                content: commentText.trim(),
            });
            toast({ title: "Posted", description: "Comment added!" });
            setCommentText("");
            setShowCommentInput(false);
            setShowCommentsSection(true);
        } catch (error) {
            console.error("Error posting comment:", error);
            toast({ title: "Error", description: "Failed to post comment", variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    // Focus input when opened
    useEffect(() => {
        if (showCommentInput && commentInputRef.current) {
            commentInputRef.current.focus();
        }
    }, [showCommentInput]);

    // Get content to display
    const getContent = () => {
        if (fullContent) {
            return post.content;
        }
        const preview = post.isHtml
            ? stripHtml(post.content).slice(0, 280)
            : post.content.slice(0, 280);
        return preview;
    };

    const contentPreview = getContent();
    const hasMore = !fullContent && post.content.length > 280;

    return (
        <article className="py-5 border-b border-green-800/40 last:border-b-0">
            {/* Pinned indicator */}
            {post.isPinned && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-500 mb-2">
                    <Pin className="w-3 h-3" />
                    <span>Pinned</span>
                </div>
            )}

            {/* Header: Avatar + Username + Time */}
            <div className="flex items-center gap-3 mb-3">
                <Link
                    to={`/user/${post.authorUsername || post.author}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0"
                >
                    <UserAvatarWithStatus
                        profile={{
                            avatar_url: post.authorAvatar,
                            display_name: post.author,
                            username: post.authorUsername,
                            last_seen: post.authorLastSeen
                        }}
                        className="w-10 h-10 border border-green-700/50"
                    />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Link
                            to={`/user/${post.authorUsername || post.author}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-green-300 hover:text-green-200 text-sm"
                        >
                            @{post.authorUsername || post.author || "anonymous"}
                        </Link>
                        <span className="text-gray-500 text-xs">·</span>
                        <span className="text-gray-500 text-xs">{relativeTime}</span>
                        {fullContent && (
                            <>
                                <span className="text-gray-500 text-xs">·</span>
                                <span className="text-gray-500 text-xs">{readMins} min read</span>
                                {post.viewCount !== undefined && (
                                    <>
                                        <span className="text-gray-500 text-xs">·</span>
                                        <span className="text-gray-500 text-xs flex items-center gap-1">
                                            <Eye className="w-3 h-3" /> {post.viewCount}
                                        </span>
                                    </>
                                )}
                            </>
                        )}
                        {/* Admin pin button */}
                        {isAdmin && onTogglePin && post.postId && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTogglePin(post.postId!, post.isPinned || false);
                                }}
                                className={`ml-auto p-1 rounded transition-colors ${post.isPinned ? "text-yellow-500" : "text-gray-500 hover:text-yellow-500"
                                    }`}
                                title={post.isPinned ? "Unpin" : "Pin"}
                            >
                                <Pin className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Title + Content - Clickable area (only for preview mode) */}
            <div
                onClick={!fullContent ? () => navigate(`/post/${post.slug}`) : undefined}
                className={!fullContent ? "cursor-pointer" : ""}
            >
                {/* Title - Compact, clean hierarchy */}
                <h2
                    className={`${fullContent ? 'text-xl md:text-2xl' : 'text-lg'} font-semibold text-green-50 mb-2 leading-snug tracking-normal ${titleIsArabic ? 'text-right arabic-text' : 'text-left'}`}
                    dir={titleIsArabic ? 'rtl' : 'ltr'}
                >
                    {post.title}
                </h2>

                {/* Content - Compact reading size */}
                {fullContent ? (
                    <div
                        dir={contentIsArabic ? 'rtl' : 'ltr'}
                        className={`prose prose-invert prose-sm max-w-none text-gray-400 font-normal leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_p]:mb-3 ${contentIsArabic ? 'text-right arabic-text' : 'text-left'}`}
                        dangerouslySetInnerHTML={{ __html: decodeHtml(post.content) }}
                    />
                ) : (
                    <p
                        dir={contentIsArabic ? 'rtl' : 'ltr'}
                        className={`text-gray-500 text-sm font-normal leading-relaxed mb-3 ${contentIsArabic ? 'text-right arabic-text' : 'text-left'}`}
                    >
                        {post.isHtml ? (
                            <span dangerouslySetInnerHTML={{ __html: decodeHtml(contentPreview) }} />
                        ) : (
                            contentPreview
                        )}
                        {hasMore && <span className="text-green-500"> ...read more</span>}
                    </p>
                )}
            </div>

            {/* Media Carousel */}
            {displayMedia && displayMedia.length > 0 && (
                <div className="my-4" onClick={(e) => e.stopPropagation()}>
                    <MediaCarousel media={displayMedia} compact={!fullContent} musicMetadata={post.music_metadata} />
                </div>
            )}

            {/* GIF Display */}
            {post.gif_url && (
                <div className="my-4" onClick={(e) => e.stopPropagation()}>
                    <img
                        src={post.gif_url}
                        alt="GIF"
                        className="max-w-full max-h-80 rounded-lg border border-green-500/20"
                    />
                </div>
            )}

            {/* Actions Row */}
            <div className="flex items-center gap-6 pt-2">
                {/* Like Button */}
                <button
                    onClick={handleLike}
                    disabled={toggling}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${hasLiked ? "text-red-400" : "text-gray-500 hover:text-red-400"
                        }`}
                >
                    <Heart className={`w-4 h-4 ${hasLiked ? "fill-current" : ""}`} />
                    <span>{likeCount > 0 ? likeCount : ""}</span>
                </button>

                {/* Bookmark Button */}
                <div onClick={(e) => e.stopPropagation()} className="text-gray-500 hover:text-green-400">
                    <BookmarkButton postId={post.slug} compact />
                </div>

                {/* Comment Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!user) {
                            toast({ title: "Login required", description: "Please login to comment", variant: "destructive" });
                            return;
                        }
                        if (fullContent) {
                            setShowCommentsSection(!showCommentsSection);
                        } else {
                            setShowCommentInput(!showCommentInput);
                        }
                    }}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${(showCommentInput || showCommentsSection) ? "text-green-400" : "text-gray-500 hover:text-green-400"
                        }`}
                >
                    <MessageCircle className="w-4 h-4" />
                    <span>Comment</span>
                </button>

                {/* Admin Actions */}
                {isAdmin && post.postId && (
                    <div className="ml-auto flex items-center gap-2">
                        {/* Hide/Show Button */}
                        {onHide && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onHide(post.postId!);
                                }}
                                className={`p-1.5 rounded transition-colors ${isHidden ? 'text-yellow-500 hover:text-yellow-400' : 'text-gray-500 hover:text-yellow-500'}`}
                                title={isHidden ? "Show post" : "Hide post"}
                            >
                                <EyeOff className="w-4 h-4" />
                            </button>
                        )}
                        {/* Delete Button */}
                        {onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Are you sure you want to delete this post?')) {
                                        onDelete(post.postId!);
                                    }
                                }}
                                className="p-1.5 rounded text-gray-500 hover:text-red-500 transition-colors"
                                title="Delete post"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Inline Comment Input (for preview mode) */}
            {!fullContent && (
                <div
                    className={`overflow-hidden transition-all duration-300 ease-out ${showCommentInput ? "max-h-40 opacity-100 mt-4" : "max-h-0 opacity-0"
                        }`}
                >
                    <div className="flex gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-900/30 border border-green-700/50 flex items-center justify-center text-xs font-medium text-green-400 flex-shrink-0">
                            {user?.username?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div className="flex-1">
                            <textarea
                                ref={commentInputRef}
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Write a comment..."
                                rows={2}
                                className="w-full bg-black/50 border border-green-700/50 rounded-lg p-2 text-sm text-green-100 placeholder-gray-600 focus:border-green-500 focus:outline-none resize-none"
                                onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCommentInput(false);
                                        setCommentText("");
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-400"
                                >
                                    <X className="w-3 h-3" />
                                    Cancel
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubmitComment();
                                    }}
                                    disabled={submitting || !commentText.trim()}
                                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-500 text-black rounded disabled:opacity-50"
                                >
                                    {submitting ? "Posting..." : (
                                        <>
                                            <Send className="w-3 h-3" />
                                            Post
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Full Comments Section (for full content mode) */}
            {fullContent && (
                <div
                    className={`overflow-hidden transition-all duration-300 ease-out ${showCommentsSection ? "max-h-[2000px] opacity-100 mt-6" : "max-h-0 opacity-0"
                        }`}
                >
                    <CommentList postId={post.postId || post.slug} postAuthorId={post.userId} />
                </div>
            )}
        </article>
    );
}
