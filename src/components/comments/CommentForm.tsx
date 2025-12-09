import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createComment, type Comment } from "@/hooks/useComments";
import { useToast } from "@/hooks/use-toast";

interface CommentFormProps {
    postId: string;
    onSuccess?: () => void;
}

export default function CommentForm({ postId, onSuccess }: CommentFormProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!content.trim()) {
            toast({
                title: "Error",
                description: "Comment cannot be empty",
                variant: "destructive",
            });
            return;
        }

        if (!user) {
            toast({
                title: "Error",
                description: "You must be logged in to comment",
                variant: "destructive",
            });
            return;
        }

        setSubmitting(true);
        try {
            await createComment({
                post_id: postId,
                user_id: user.id,
                author_name: user.displayName || "Anonymous",
                content: content.trim(),
            });

            toast({
                title: "Success",
                description: "Comment posted!",
            });

            setContent("");
            onSuccess?.();
        } catch (error) {
            console.error("Error posting comment:", error);
            toast({
                title: "Error",
                description: "Failed to post comment",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="ascii-box bg-secondary/20 p-4">
            <pre className="ascii-highlight text-xs mb-2">NEW COMMENT</pre>
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="w-full bg-background border border-ascii-border p-3 ascii-text focus:border-ascii-highlight focus:outline-none resize-none mb-3"
                placeholder="Write your comment..."
                disabled={submitting}
            />
            <div className="flex justify-between items-center">
                <span className="ascii-dim text-xs">
                    {user ? `Posting as ${user.displayName}` : "Login to comment"}
                </span>
                <button
                    type="submit"
                    disabled={submitting || !user}
                    className="ascii-nav-link hover:ascii-highlight border border-ascii-border px-4 py-2 disabled:opacity-50"
                >
                    {submitting ? "► POSTING..." : "► POST COMMENT"}
                </button>
            </div>
        </form>
    );
}
