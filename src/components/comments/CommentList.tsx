import { useComments, type Comment } from "@/hooks/useComments";
import CommentForm from "./CommentForm";
import CommentItem from "./CommentItem";
import { MessageSquare } from "lucide-react";

interface CommentListProps {
    postId: string;
    postAuthorId?: string;
}

// Build a tree structure from flat comments
function buildCommentTree(comments: Comment[]): Comment[] {
    const commentMap = new Map<string, Comment>();
    const roots: Comment[] = [];

    // First pass: create a map of all comments
    comments.forEach((comment) => {
        commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: build the tree
    comments.forEach((comment) => {
        const commentWithReplies = commentMap.get(comment.id)!;
        if (comment.parent_id && commentMap.has(comment.parent_id)) {
            // This is a reply - add to parent
            const parent = commentMap.get(comment.parent_id)!;
            parent.replies = parent.replies || [];
            parent.replies.push(commentWithReplies);
        } else {
            // This is a top-level comment
            roots.push(commentWithReplies);
        }
    });

    return roots;
}

export default function CommentList({ postId, postAuthorId }: CommentListProps) {
    const { comments, loading, error } = useComments(postId);

    // Build tree structure for nested display
    const commentTree = buildCommentTree(comments);

    return (
        <div className="mt-8">
            {/* Clean Header */}
            <div className="flex items-center gap-2 mb-6">
                <MessageSquare className="w-5 h-5 text-green-500" />
                <h3 className="text-lg font-medium text-green-400">
                    Comments
                </h3>
                <span className="text-sm text-gray-500">
                    ({comments.length})
                </span>
            </div>

            {/* Comment Form */}
            <CommentForm postId={postId} postAuthorId={postAuthorId} />

            {/* Comments List */}
            <div className="mt-6">
                {loading ? (
                    <div className="text-center py-8">
                        <div className="inline-block w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-500 text-sm mt-2">Loading comments...</p>
                    </div>
                ) : error ? (
                    <div className="text-center py-8">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                ) : commentTree.length === 0 ? (
                    <p className="text-gray-500 text-xs py-2">No comments yet</p>
                ) : (
                    <div className="divide-y divide-green-900/30">
                        {commentTree.map((comment) => (
                            <CommentItem
                                key={comment.id}
                                comment={comment}
                                postId={postId}
                                postAuthorId={postAuthorId}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
