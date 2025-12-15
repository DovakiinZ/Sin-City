import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { deleteComment, updateComment, type Comment } from "@/hooks/useComments";
import { useToast } from "@/hooks/use-toast";
import { parseMentions } from "@/lib/mentions";

interface CommentItemProps {
    comment: Comment;
}

export default function CommentItem({ comment }: CommentItemProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(comment.content);
    const [updating, setUpdating] = useState(false);

    const isOwner = user?.id === comment.user_id;
    const formattedDate = new Date(comment.created_at).toLocaleString();

    const handleUpdate = async () => {
        if (!editContent.trim()) return;

        setUpdating(true);
        try {
            await updateComment(comment.id, editContent.trim());
            toast({ title: "Success", description: "Comment updated!" });
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
            toast({ title: "Success", description: "Comment deleted!" });
        } catch (error) {
            console.error("Error deleting comment:", error);
            toast({
                title: "Error",
                description: "Failed to delete comment",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="border-l-2 border-ascii-border pl-4 py-2">
            <div className="flex justify-between items-start mb-2">
                <div>
                    <span className="ascii-highlight">{comment.author_name}</span>
                    <span className="ascii-dim text-xs ml-2">{formattedDate}</span>
                </div>
                {isOwner && !isEditing && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsEditing(true)}
                            className="ascii-text text-xs hover:ascii-highlight"
                        >
                            [EDIT]
                        </button>
                        <button
                            onClick={handleDelete}
                            className="ascii-text text-xs hover:text-red-400"
                        >
                            [DELETE]
                        </button>
                    </div>
                )}
            </div>

            {isEditing ? (
                <div>
                    <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full bg-background border border-ascii-border p-2 ascii-text focus:border-ascii-highlight focus:outline-none resize-none mb-2"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleUpdate}
                            disabled={updating}
                            className="ascii-nav-link text-xs hover:ascii-highlight"
                        >
                            {updating ? "Saving..." : "Save"}
                        </button>
                        <button
                            onClick={() => {
                                setIsEditing(false);
                                setEditContent(comment.content);
                            }}
                            className="ascii-dim text-xs hover:ascii-text"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <pre className="ascii-text text-sm whitespace-pre-wrap">{parseMentions(comment.content)}</pre>
            )}
        </div>
    );
}
