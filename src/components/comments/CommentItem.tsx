import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { deleteComment, updateComment, createComment, type Comment } from "@/hooks/useComments";
import { useToast } from "@/hooks/use-toast";
import { parseMentions } from "@/lib/mentions";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Pencil, Trash2, Reply, Send, X } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CommentItemProps {
    comment: Comment;
    postId: string;
    postAuthorId?: string;
    depth?: number;
}

export default function CommentItem({ comment, postId, postAuthorId, depth = 0 }: CommentItemProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(comment.content);
    const [updating, setUpdating] = useState(false);

    // Reply state
    const [isReplying, setIsReplying] = useState(false);
    const [replyContent, setReplyContent] = useState("");
    const [submittingReply, setSubmittingReply] = useState(false);

    const isOwner = user?.id === comment.user_id;
    const isPostAuthor = comment.user_id === postAuthorId;
    const isCurrentUser = user?.id === comment.user_id;
    const maxDepth = 3; // Limit nesting depth

    // Relative time (e.g., "2h ago")
    const relativeTime = formatDistanceToNow(new Date(comment.created_at), { addSuffix: true });

    // Detect Arabic text
    const isArabic = (text: string) => {
        const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
        return arabicRegex.test(text);
    };
    const contentIsArabic = comment.content ? isArabic(comment.content) : false;

    const handleUpdate = async () => {
        if (!editContent.trim()) return;

        setUpdating(true);
        try {
            await updateComment(comment.id, editContent.trim());
            toast({ title: "Updated", description: "Comment saved" });
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating comment:", error);
            toast({
                title: "Error",
                description: "Failed to update comment",
                variant: "destructive",
            });
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this comment?")) return;

        try {
            await deleteComment(comment.id);
            toast({ title: "Deleted", description: "Comment removed" });
        } catch (error) {
            console.error("Error deleting comment:", error);
            toast({
                title: "Error",
                description: "Failed to delete comment",
                variant: "destructive",
            });
        }
    };

    const handleReply = async () => {
        if (!replyContent.trim() || !user) return;

        setSubmittingReply(true);
        try {
            await createComment({
                post_id: postId,
                user_id: user.id,
                author_name: user.username || "Anonymous",
                content: replyContent.trim(),
                parent_id: comment.id,
            });
            toast({ title: "Replied", description: "Reply added!" });
            setReplyContent("");
            setIsReplying(false);
        } catch (error) {
            console.error("Error posting reply:", error);
            toast({
                title: "Error",
                description: "Failed to post reply",
                variant: "destructive",
            });
        } finally {
            setSubmittingReply(false);
        }
    };

    // Get role badge
    const getRoleBadge = () => {
        if (isPostAuthor) {
            return (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded">
                    Author
                </span>
            );
        }
        if (isCurrentUser) {
            return (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded">
                    You
                </span>
            );
        }
        return null;
    };

    // Get avatar initial
    const getInitial = () => {
        return comment.author_name?.charAt(0).toUpperCase() || "?";
    };

    // Get user initial for reply form
    const getUserInitial = () => {
        return user?.username?.charAt(0).toUpperCase() || "?";
    };

    return (
        <div className={`py-3 group ${depth > 0 ? 'ml-6 pl-4 border-l border-green-900/30' : ''}`}>
            {/* Header Row: Avatar + Username + Badge + Time */}
            <div className="flex items-center gap-2 mb-2">
                {/* Avatar */}
                <Link to={`/user/${comment.author_username || comment.author_name}`} className="w-7 h-7 rounded-full bg-green-900/30 border border-green-700/50 flex items-center justify-center text-xs font-medium text-green-400 flex-shrink-0 overflow-hidden hover:border-green-500 transition-colors">
                    {comment.author_avatar ? (
                        <img
                            src={comment.author_avatar}
                            alt={comment.author_name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        getInitial()
                    )}
                </Link>

                {/* Username + Badge */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Link to={`/user/${comment.author_username || comment.author_name}`} className="font-medium text-green-300 text-sm truncate hover:underline hover:text-green-200 transaction-colors">
                        {comment.author_name}
                    </Link>
                    {getRoleBadge()}
                </div>

                {/* Time + Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                        {relativeTime}
                    </span>

                    {/* Actions Menu */}
                    {isOwner && !isEditing && (
                        <DropdownMenu>
                            <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-green-900/20 rounded">
                                <MoreHorizontal className="w-4 h-4 text-gray-500" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-black border-green-700">
                                <DropdownMenuItem
                                    onClick={() => setIsEditing(true)}
                                    className="text-green-400 hover:bg-green-900/20 cursor-pointer"
                                >
                                    <Pencil className="w-3 h-3 mr-2" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={handleDelete}
                                    className="text-red-400 hover:bg-red-900/20 cursor-pointer"
                                >
                                    <Trash2 className="w-3 h-3 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            {/* Comment Content */}
            <div className="pl-9">
                {isEditing ? (
                    <div className="space-y-2">
                        <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full bg-black/50 border border-green-700/50 rounded-lg p-3 text-sm text-green-100 focus:border-green-500 focus:outline-none resize-none"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleUpdate}
                                disabled={updating}
                                className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-black rounded transition-colors disabled:opacity-50"
                            >
                                {updating ? "Saving..." : "Save"}
                            </button>
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditContent(comment.content);
                                }}
                                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {comment.content && (
                            <p
                                dir={contentIsArabic ? "rtl" : "ltr"}
                                className={`text-sm text-gray-300 leading-relaxed whitespace-pre-wrap ${contentIsArabic ? 'arabic-text text-right' : 'text-left'}`}
                                style={{
                                    unicodeBidi: contentIsArabic ? 'plaintext' : undefined
                                }}
                            >
                                {parseMentions(comment.content)}
                            </p>
                        )}

                        {/* GIF Display */}
                        {comment.gif_url && (
                            <div className="mt-2">
                                <img
                                    src={comment.gif_url}
                                    alt="GIF"
                                    className="max-h-40 rounded-lg border border-green-500/20"
                                />
                            </div>
                        )}

                        {/* Reply Button */}
                        {user && depth < maxDepth && !isReplying && (
                            <button
                                onClick={() => setIsReplying(true)}
                                className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-green-400 transition-colors"
                            >
                                <Reply className="w-3 h-3" />
                                Reply
                            </button>
                        )}
                    </>
                )}

                {/* Inline Reply Form */}
                {isReplying && (
                    <div className="mt-3 flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-green-900/30 border border-green-700/50 flex items-center justify-center text-[10px] font-medium text-green-400 flex-shrink-0">
                            {getUserInitial()}
                        </div>
                        <div className="flex-1">
                            <textarea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                rows={2}
                                placeholder={`Reply to ${comment.author_name}...`}
                                className="w-full bg-black/50 border border-green-700/50 rounded-lg p-2 text-sm text-green-100 focus:border-green-500 focus:outline-none resize-none"
                                autoFocus
                            />
                            <div className="flex items-center justify-end gap-2 mt-2">
                                <button
                                    onClick={() => {
                                        setIsReplying(false);
                                        setReplyContent("");
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-400"
                                >
                                    <X className="w-3 h-3" />
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReply}
                                    disabled={submittingReply || !replyContent.trim()}
                                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-500 text-black rounded disabled:opacity-50"
                                >
                                    {submittingReply ? (
                                        "Posting..."
                                    ) : (
                                        <>
                                            <Send className="w-3 h-3" />
                                            Reply
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Nested Replies */}
                {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-3">
                        {comment.replies.map((reply) => (
                            <CommentItem
                                key={reply.id}
                                comment={reply}
                                postId={postId}
                                postAuthorId={postAuthorId}
                                depth={depth + 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
