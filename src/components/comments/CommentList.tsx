import { useComments } from "@/hooks/useComments";
import CommentForm from "./CommentForm";
import CommentItem from "./CommentItem";

interface CommentListProps {
    postId: string;
}

export default function CommentList({ postId }: CommentListProps) {
    const { comments, loading, error } = useComments(postId);

    return (
        <div className="mt-8">
            <pre className="ascii-highlight mb-4">
                {`╔═══════════════════════════════════════════════════════════════╗
║                         COMMENTS                              ║
╚═══════════════════════════════════════════════════════════════╝`}
            </pre>

            <CommentForm postId={postId} />

            <div className="mt-6">
                {loading ? (
                    <div className="ascii-dim text-center">Loading comments...</div>
                ) : error ? (
                    <div className="text-red-400 text-center">{error}</div>
                ) : comments.length === 0 ? (
                    <div className="ascii-dim text-center py-8">
                        No comments yet. Be the first to comment!
                    </div>
                ) : (
                    <div className="space-y-4">
                        {comments.map((comment) => (
                            <CommentItem key={comment.id} comment={comment} />
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-4 ascii-dim text-xs text-center">
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </div>
        </div>
    );
}
