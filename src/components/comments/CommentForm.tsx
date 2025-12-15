import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { createComment } from "@/hooks/useComments";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

interface CommentFormProps {
    postId: string;
    onSuccess?: () => void;
}

interface UserSuggestion {
    username: string;
    avatar_url: string | null;
}

export default function CommentForm({ postId, onSuccess }: CommentFormProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Mention state
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
    const [mentionQuery, setMentionQuery] = useState("");
    const [cursorPosition, setCursorPosition] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [networkIds, setNetworkIds] = useState<Set<string>>(new Set());

    // Load network (followers + following)
    useEffect(() => {
        const loadNetwork = async () => {
            if (!user) return;

            // Get users I follow
            const { data: following } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', user.id);

            // Get users following me
            const { data: followers } = await supabase
                .from('follows')
                .select('follower_id')
                .eq('following_id', user.id);

            const ids = new Set<string>();
            following?.forEach(f => ids.add(f.following_id));
            followers?.forEach(f => ids.add(f.follower_id));

            setNetworkIds(ids);
        };

        loadNetwork();
    }, [user]);

    const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;
        setContent(value);
        setCursorPosition(pos);

        // Detect if we are typing a mention
        // Look backwards from cursor to find the last @
        const textBeforeCursor = value.substring(0, pos);
        const lastAt = textBeforeCursor.lastIndexOf("@");

        if (lastAt !== -1) {
            const query = textBeforeCursor.substring(lastAt + 1);
            // Check if there are spaces in the query (simple validation to stop searching if typing normal sentence)
            // But allow spaces if we want to search by display name? Usually usernames don't have spaces.
            // Let's strict it to no spaces for now for username matching logic, 
            // or allow if we want to support "John Doe" display name search.
            // For now, strict to catch "@user"
            if (!/\s/.test(query)) {
                setMentionQuery(query);
                setShowSuggestions(true);
                searchUsers(query);
                return;
            }
        }

        setShowSuggestions(false);
    };

    const searchUsers = async (query: string) => {
        if (!query || networkIds.size === 0) {
            setSuggestions([]);
            return;
        }

        const idsArray = Array.from(networkIds);

        // Limit the number of IDs passed to avoid URL length issues if network is massive (unlikely for now)
        // If huge, we'd need a backend function or different logic.

        const { data } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in('id', idsArray)
            .ilike('username', `${query}%`) // Only search by username
            .limit(5);

        if (data) {
            setSuggestions(data);
        }
    };

    const insertMention = (username: string) => {
        const textBeforeCursor = content.substring(0, cursorPosition);
        const lastAt = textBeforeCursor.lastIndexOf("@");
        const textAfterCursor = content.substring(cursorPosition);

        const newtext = textBeforeCursor.substring(0, lastAt) + `@${username} ` + textAfterCursor;
        setContent(newtext);
        setShowSuggestions(false);

        // Reset focus
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                // Set cursor after the inserted mention
                const newPos = lastAt + username.length + 2; // @ + username + space
                textareaRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // ... (rest of standard submit logic)

        if (!content.trim()) return; // Simple check, real logic usually inside

        if (!user) {
            toast({ title: "Error", description: "Login required", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        try {
            await createComment({
                post_id: postId,
                user_id: user.id,
                author_name: user.username || "Anonymous",
                content: content.trim(),
            });

            toast({ title: "Success", description: "Comment posted!" });
            setContent("");
            onSuccess?.();
        } catch (error) {
            console.error("Error posting comment:", error);
            toast({ title: "Error", description: "Failed to post comment", variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        // Hide suggestions if clicked outside logic could go here, 
        // but for now relying on blur/select logic
    }, []);

    return (
        <div className="relative">
            <form onSubmit={handleSubmit} className="ascii-box bg-secondary/20 p-4">
                <pre className="ascii-highlight text-xs mb-2">NEW COMMENT</pre>

                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={handleInputChange}
                        rows={4}
                        className="w-full bg-background border border-ascii-border p-3 ascii-text focus:border-ascii-highlight focus:outline-none resize-none mb-3"
                        placeholder="Write your comment... (Type @ to mention)"
                        disabled={submitting}
                    />

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute left-0 bottom-full mb-2 w-64 bg-black border border-green-700 shadow-xl z-50">
                            <div className="p-1 bg-green-900/20 text-xs text-green-500 border-b border-green-700/50">
                                Suggestions matching "{mentionQuery}"
                            </div>
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion.username}
                                    type="button"
                                    onClick={() => insertMention(suggestion.username)}
                                    className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-green-900/30 flex items-center gap-2"
                                >
                                    <div className="w-5 h-5 rounded-full bg-green-900/50 flex items-center justify-center text-[10px] border border-green-700">
                                        {suggestion.avatar_url ? (
                                            <img src={suggestion.avatar_url} className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            suggestion.username[0].toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold">@{suggestion.username}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center">
                    <span className="ascii-dim text-xs">
                        {user ? `Posting as @${user.username}` : "Login to comment"}
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
        </div>
    );
}
