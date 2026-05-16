import { useState, useRef, useEffect, useMemo } from "react";
import { UserAvatarWithStatus } from "@/components/UserAvatarWithStatus";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { Heart, MessageCircle, Pin, Send, X, Eye, EyeOff, Trash2, Search, Terminal, Lock, Globe, Crown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useIdentity, useContentAuthor } from "@/hooks/useIdentity";
import { useReactions, toggleReaction } from "@/hooks/useReactions";
import { useToast } from "@/hooks/use-toast";
import { createComment } from "@/hooks/useComments";
import { decodeHtml, stripHtml } from "@/lib/markdown";
import MediaCarousel from "@/components/media/PostMediaCarousel";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import CommentList from "@/components/comments/CommentList";
import { MusicMetadata } from "@/components/MusicCard";
import AdminPostInspector from "@/components/admin/AdminPostInspector";
import AdminPostTerminal from "@/components/admin/AdminPostTerminal";
import NowPlayingStatus from "./effects/NowPlayingStatus";
import { supabase } from "@/lib/supabase";

// Batch-provided data to avoid N+1 queries in feed mode
export interface BatchPollData {
    id: string;
    question: string;
    post_id: string;
    options: { id: string; text: string }[];
    votes: { option_id: string; user_id: string }[];
}

export interface BatchReactionData {
    likeCount: number;
    hasLiked: boolean;
}

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
        authorDiscordId?: string;
        authorSpotifyStatus?: any;
        isPinned?: boolean;
        isHtml?: boolean;
        attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
        gif_url?: string;
        userId?: string;
        viewCount?: number;
        music_metadata?: MusicMetadata | null;  // Cached music metadata for fallback
        guestId?: string;  // Guest ID for anonymous posts (admin tracking)
        anonymousId?: string;  // Human-readable ANON-XXXX ID (admin only)
        textAlign?: 'right' | 'center' | 'left';  // Text alignment
        is_deleted?: boolean;
        is_registered_only?: boolean;
        author_role?: string;
    };
    fullContent?: boolean; // Show full content instead of preview
    showComments?: boolean; // Show comments section
    onTogglePin?: (postId: string, isPinned: boolean) => void; // Admin pin toggle
    onHide?: (postId: string) => void; // Admin hide post
    onDelete?: (postId: string) => void; // Admin delete post
    isAdmin?: boolean;
    isHidden?: boolean; // Track if post is hidden
    batchPoll?: BatchPollData | null; // Pre-fetched poll data from parent
    batchReaction?: BatchReactionData | null; // Pre-fetched reaction data from parent
}

export default function PostCard({
    post,
    fullContent = false,
    showComments = false,
    onTogglePin,
    onHide,
    onDelete,
    isAdmin = false,
    isHidden = false,
    batchPoll,
    batchReaction
}: PostCardProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();
    const { identity } = useIdentity();
    const { user_id, guest_id, isReady } = useContentAuthor();
    const postIdForReactions = post.postId || post.slug;
    // Only use the heavy useReactions hook (with realtime channel) on the detail page
    const realtimeReactions = useReactions(fullContent ? postIdForReactions : '');

    // Comment state
    const [showCommentInput, setShowCommentInput] = useState(false);
    const [showCommentsSection, setShowCommentsSection] = useState(showComments);
    const [commentText, setCommentText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [toggling, setToggling] = useState(false);
    const commentInputRef = useRef<HTMLTextAreaElement>(null);

    // Admin inspector state for anonymous posts
    const [showInspector, setShowInspector] = useState(false);

    // Admin terminal state
    const [showTerminal, setShowTerminal] = useState(false);

    // Poll state — use batch data from parent if available, else fetch per-card (detail page only)
    const [poll, setPoll] = useState<any>(batchPoll || null);
    const [pollOptions, setPollOptions] = useState<any[]>(batchPoll?.options || []);
    const [pollVotes, setPollVotes] = useState<any[]>(batchPoll?.votes || []);
    const [isVoting, setIsVoting] = useState(false);

    // Sync poll state when batchPoll prop arrives/changes
    useEffect(() => {
        if (batchPoll) {
            setPoll(batchPoll);
            setPollOptions(batchPoll.options || []);
            setPollVotes(batchPoll.votes || []);
        }
    }, [batchPoll]);

    // Only fetch poll per-card on the detail page (fullContent) if no batch data provided
    useEffect(() => {
        if (batchPoll !== undefined) return; // batch data provided (even if null = no poll)
        if (!fullContent) return; // Don't fetch in feed mode
        if (!post.postId) return;
        const fetchPoll = async () => {
            try {
                const { data: pollData, error } = await supabase
                    .from('post_polls')
                    .select('*, options:post_poll_options(*), votes:post_poll_votes(*)')
                    .eq('post_id', post.postId)
                    .maybeSingle();

                if (error) {
                    console.warn('[PostCard] Poll fetch error for post', post.postId, ':', error);
                    return;
                }

                if (pollData) {
                    console.log('[PostCard] Found poll for post', post.postId, ':', pollData.question);
                    setPoll(pollData);
                    setPollOptions(pollData.options || []);
                    setPollVotes(pollData.votes || []);
                }
            } catch (err) {
                console.warn('[PostCard] Poll fetch exception:', err);
            }
        };
        fetchPoll();
    }, [post.postId, fullContent, batchPoll]);

    const handleVote = async (optionId: string) => {
        if (!user) {
            toast({ title: "Login required", description: "Please login to vote", variant: "destructive" });
            return;
        }
        if (isVoting || !poll) return;

        const existingVote = pollVotes.find(v => v.user_id === user.id);

        // If clicking the same option, do nothing
        if (existingVote?.option_id === optionId) return;

        setIsVoting(true);
        try {
            if (existingVote) {
                // Change vote: delete old, insert new
                const { error: deleteError } = await supabase
                    .from('post_poll_votes')
                    .delete()
                    .eq('poll_id', poll.id)
                    .eq('user_id', user.id);

                if (deleteError) throw deleteError;

                const { error: insertError } = await supabase
                    .from('post_poll_votes')
                    .insert([{ poll_id: poll.id, option_id: optionId, user_id: user.id }]);

                if (insertError) throw insertError;

                // Optimistically update
                setPollVotes(prev => [
                    ...prev.filter(v => v.user_id !== user.id),
                    { poll_id: poll.id, option_id: optionId, user_id: user.id }
                ]);
            } else {
                // First vote
                const { error } = await supabase
                    .from('post_poll_votes')
                    .insert([{ poll_id: poll.id, option_id: optionId, user_id: user.id }]);

                if (error) throw error;

                setPollVotes(prev => [...prev, { poll_id: poll.id, option_id: optionId, user_id: user.id }]);
            }
        } catch (err) {
            console.error("Voting error:", err);
            toast({ title: "Error", description: "Failed to vote", variant: "destructive" });
        } finally {
            setIsVoting(false);
        }
    };
    
    const userVotedOptionId = user ? pollVotes.find(v => v.user_id === user.id)?.option_id : null;
    const totalVotes = pollVotes.length;

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

    // Check if user has liked — prefer batch data in feed mode
    const hasLiked = batchReaction
        ? batchReaction.hasLiked
        : realtimeReactions.reactions.some(r => r.reaction_type === "like" && r.user_id === user?.id);
    const likeCount = batchReaction
        ? batchReaction.likeCount
        : realtimeReactions.counts.find(c => c.reaction_type === "like")?.count || 0;

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
        if (user?.id && fullContent) {
            realtimeReactions.optimisticToggle(user.id, "like");
        }
        try {
            await toggleReaction(postIdForReactions, user.id, "like");
        } catch (error) {
            console.error("Error toggling like:", error);
        } finally {
            setToggling(false);
        }
    };
    
    // Check if current user is the author
    const isAuthor = useMemo(() => {
        if (!isReady) return false;
        if (user_id && post.userId === user_id) return true;
        if (guest_id && post.guestId === guest_id) return true;
        return false;
    }, [isReady, user_id, guest_id, post.userId, post.guestId]);

    // Handle comment submission
    const handleSubmitComment = async () => {
        if (!commentText.trim()) return;
        if (!isReady) {
            toast({ title: "Initializing...", description: "Please wait a moment" });
            return;
        }

        if (!user) {
            toast({ title: "Login required", description: "Please login to comment", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        try {
            await createComment({
                post_id: post.postId || post.slug,
                user_id: user_id || undefined,
                guest_id: guest_id || undefined,
                author_name: user?.username || "Anonymous",
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
    // Get role badge
    const getRoleBadge = () => {
        if (post.author_role === 'ceo') {
            return (
                <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-600 text-black rounded shadow-[0_0_10px_rgba(234,179,8,0.4)] uppercase tracking-tighter">
                    <Crown className="w-2.5 h-2.5" />
                    CEO
                </span>
            );
        }
        if (post.author_role === 'admin') {
            return (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase tracking-wider">
                    Admin
                </span>
            );
        }
        return null;
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
        
        // Before stripping HTML, convert line-breaking tags to newlines for the preview
        const contentWithNewlines = post.content
            .replace(/<(br|p|div)[^>]*>/gi, '\n')
            .replace(/<\/(p|div)>/gi, '\n');
            
        const preview = stripHtml(contentWithNewlines).slice(0, 280);
        return preview;
    };

    const contentPreview = getContent();
    const hasMore = !fullContent && (stripHtml(post.content).length > 280);

    return (
        <article className="py-5 border-b border-green-800/40 last:border-b-0">
            {/* Pinned indicator */}
            {post.isPinned && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-500 mb-2">
                    <Pin className="w-3 h-3" />
                    <span>Pinned</span>
                </div>
            )}
            
            {/* Deleted indicator for admins */}
            {isAdmin && post.is_deleted && (
                <div className="flex items-center gap-1.5 text-xs text-red-500 mb-2 font-bold animate-pulse">
                    <Trash2 className="w-3 h-3" />
                    <span>[ DELETED ]</span>
                </div>
            )}

            {/* Registered only indicator */}
            {post.is_registered_only && (
                <div className="flex items-center gap-1.5 text-xs text-blue-400 mb-2 font-medium">
                    <Lock className="w-3 h-3" />
                    <span className="uppercase tracking-wider">Registered Only</span>
                </div>
            )}

            {/* Header: Avatar + Username + Time */}
            <div className={`flex items-center gap-3 mb-3 ${contentIsArabic || titleIsArabic ? 'flex-row-reverse' : ''}`}>
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
                <div className={`flex-1 min-w-0 ${contentIsArabic || titleIsArabic ? 'text-right' : 'text-left'}`}>
                    <div className={`flex items-center gap-2 flex-wrap ${contentIsArabic || titleIsArabic ? 'flex-row-reverse' : ''}`}>
                        <Link
                            to={`/user/${post.authorUsername || post.author}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-green-300 hover:text-green-200 text-sm"
                        >
                            @{post.authorUsername || post.author || "anonymous"}
                        </Link>
                        {getRoleBadge()}
                        {(post.authorDiscordId || post.authorSpotifyStatus) && (
                            <NowPlayingStatus discordId={post.authorDiscordId} officialSpotify={post.authorSpotifyStatus} compact={true} />
                        )}
                        <span className="text-gray-500 text-xs">·</span>
                        <span className="text-gray-500 text-xs" title={post.rawDate ? new Date(post.rawDate).toLocaleString() : undefined}>
                            {relativeTime}
                        </span>
                        {post.rawDate && (
                            <>
                                <span className="text-gray-500 text-xs">·</span>
                                <span className="text-gray-500 text-xs" title="Post time">
                                    {format(new Date(post.rawDate), 'h:mm a')}
                                </span>
                            </>
                        )}
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
                    className={`${fullContent ? 'text-xl md:text-2xl' : 'text-lg'} ${titleIsArabic ? 'font-medium' : 'font-semibold'} text-green-50 mb-2 leading-snug tracking-normal ${titleIsArabic ? 'arabic-text text-right' : 'text-left'}`}
                    dir="auto"
                >
                    {post.title}
                </h2>

                {/* Content - Preserved exactly as user typed */}
                {fullContent ? (
                    <div
                        dir="auto"
                        style={{
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            unicodeBidi: 'plaintext',
                            textAlign: post.textAlign || (contentIsArabic ? 'right' : 'left')
                        }}
                        className={`text-gray-400 font-normal leading-relaxed text-sm ${contentIsArabic ? 'arabic-text' : ''} ${isAdmin && post.is_deleted ? 'opacity-50' : ''}`}
                        dangerouslySetInnerHTML={{ __html: decodeHtml(post.content) }}
                    />
                ) : (
                    <p
                        dir="auto"
                        style={{
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            unicodeBidi: 'plaintext',
                            textAlign: post.textAlign || (contentIsArabic ? 'right' : 'left')
                        }}
                        className={`text-gray-500 text-sm font-normal leading-relaxed mb-3 ${contentIsArabic ? 'arabic-text' : ''}`}
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

            {/* Poll Display */}
            {poll && (
                <div className="my-4 border border-green-900/30 bg-black/30 rounded-lg p-4" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-green-400 font-medium mb-3">{poll.question}</h3>
                    <div className="space-y-2">
                        {pollOptions.map(option => {
                            const votesForOption = pollVotes.filter(v => v.option_id === option.id).length;
                            const percentage = totalVotes > 0 ? Math.round((votesForOption / totalVotes) * 100) : 0;
                            const isVotedByMe = userVotedOptionId === option.id;
                            const hasVoted = userVotedOptionId !== null;

                            return (
                                <button
                                    key={option.id}
                                    onClick={() => handleVote(option.id)}
                                    disabled={isVoting || !user}
                                    className={`relative w-full text-left p-3 rounded-lg overflow-hidden transition-all ${
                                        isVotedByMe
                                            ? 'bg-green-900/40 border border-green-500/50'
                                            : hasVoted
                                                ? 'bg-gray-900/50 border border-gray-800 hover:border-green-900/50 cursor-pointer'
                                                : 'bg-gray-900/50 hover:bg-gray-800 border border-gray-800 hover:border-green-900/50 cursor-pointer'
                                    }`}
                                >
                                    {/* Progress bar background */}
                                    {hasVoted && (
                                        <div 
                                            className={`absolute inset-y-0 left-0 transition-all duration-500 ${isVotedByMe ? 'bg-green-600/30' : 'bg-gray-700/30'}`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    )}
                                    
                                    <div className="relative flex justify-between items-center z-10">
                                        <span className={`text-sm flex items-center gap-2 ${isVotedByMe ? 'text-green-400 font-medium' : 'text-gray-300'}`}>
                                            {isVotedByMe && <span className="text-green-400">✓</span>}
                                            {option.text}
                                        </span>
                                        {hasVoted && (
                                            <span className="text-xs text-gray-400 ml-4">
                                                {percentage}%
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex justify-between items-center text-xs text-gray-500">
                        {userVotedOptionId && <span className="text-gray-600">Tap another option to change your vote</span>}
                        <span className="ml-auto">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
                    </div>
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

                {/* Author Delete Button — any user can soft-delete their own post */}
                {isAuthor && !post.is_deleted && post.postId && onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this post? It will be hidden from everyone.')) {
                                onDelete(post.postId!);
                            }
                        }}
                        className="ml-auto p-1.5 rounded transition-colors text-gray-500 hover:text-red-500"
                        title="Delete post"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}

                {/* Admin Actions */}
                {isAdmin && post.postId && (
                    <div className={`${isAuthor ? '' : 'ml-auto'} flex items-center gap-2`}>
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
                        {/* Admin hard delete (even if already soft-deleted) */}
                        {onDelete && !isAuthor && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Admin: permanently delete this post?')) {
                                        onDelete(post.postId!);
                                    }
                                }}
                                className={`p-1.5 rounded transition-colors ${post.is_deleted ? 'text-red-600' : 'text-gray-500 hover:text-red-500'}`}
                                title={post.is_deleted ? "Hard delete" : "Delete post"}
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

            {/* Admin Post Inspector Modal */}
            {showInspector && post.guestId && (
                <AdminPostInspector
                    guestId={post.guestId}
                    onClose={() => setShowInspector(false)}
                />
            )}

            {/* Admin Post Terminal */}
            {showTerminal && isAdmin && (
                <AdminPostTerminal
                    postId={post.postId || post.slug}
                    userId={post.userId}
                    guestId={post.guestId}
                    onClose={() => setShowTerminal(false)}
                />
            )}
        </article>
    );
}
