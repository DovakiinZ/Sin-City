import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createComment, type Comment } from "@/hooks/useComments";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { extractMentions } from "@/lib/mentions";
import MentionInput from "@/components/MentionInput";

interface CommentFormProps {
    postId: string;
    postTitle?: string;
    onSuccess?: () => void;
}

export default function CommentForm({ postId, postTitle, onSuccess }: CommentFormProps) {
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

            // Create notifications for mentioned users
            const mentions = extractMentions(content);
            console.log("[CommentForm] Mentions found:", mentions);
            if (mentions.length > 0) {
                // Look up user IDs for mentioned usernames
                for (const username of mentions) {
                    console.log("[CommentForm] Looking up user:", username);
                    const { data: mentionedUser, error: lookupError } = await supabase
                        .from("profiles")
                        .select("id")
                        .ilike("username", username)
                        .single();

                    console.log("[CommentForm] Lookup result:", { mentionedUser, lookupError });

                    if (mentionedUser && mentionedUser.id !== user.id) {
                        console.log("[CommentForm] Creating notification for:", mentionedUser.id);
                        const { error: notifError } = await supabase.from("notifications").insert({
                            user_id: mentionedUser.id,
                            type: "mention",
                            content: {
                                author: user.displayName || "Someone",
                                postSlug: postId,
                                postTitle: postTitle || "a post",
                            },
                        });

                        if (notifError) {
                            console.error("[CommentForm] Notification insert error:", notifError);
                        } else {
                            console.log("[CommentForm] Notification created successfully!");
                        }
                    }
                }
            }

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
            <MentionInput
                value={content}
                onChange={setContent}
                rows={4}
                placeholder="Write your comment... Use @ to mention users"
                disabled={submitting}
                className="mb-3"
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
