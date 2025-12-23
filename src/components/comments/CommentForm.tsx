import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { createComment } from "@/hooks/useComments";
import { replyAsThreadPost } from "@/hooks/useSupabasePosts";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Send, X, Smile } from "lucide-react";
import GifPicker from "@/components/GifPicker";

interface CommentFormProps {
    postId: string;
    postAuthorId?: string;
    onSuccess?: () => void;
}

interface UserSuggestion {
    username: string;
    avatar_url: string | null;
}

export default function CommentForm({ postId, postAuthorId, onSuccess }: CommentFormProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // GIF state
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [selectedGif, setSelectedGif] = useState<string | null>(null);

    // Thread mode state
    const [asThread, setAsThread] = useState(false);
    const canThread = user && postAuthorId && user.id === postAuthorId;

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

            const { data: following } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', user.id);

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

    // Focus textarea when expanded
    useEffect(() => {
        if (isExpanded && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isExpanded]);

    const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;
        setContent(value);
        setCursorPosition(pos);

        const textBeforeCursor = value.substring(0, pos);
        const lastAt = textBeforeCursor.lastIndexOf("@");

        if (lastAt !== -1) {
            const query = textBeforeCursor.substring(lastAt + 1);
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

        const { data } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in('id', idsArray)
            .ilike('username', `${query}%`)
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

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const newPos = lastAt + username.length + 2;
                textareaRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };

    const handleGifSelect = (url: string, id: string) => {
        setSelectedGif(url);
        setShowGifPicker(false);
    };

    const removeGif = () => {
        setSelectedGif(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Allow submit if there's text OR a GIF
        if (!content.trim() && !selectedGif) return;

        if (!user) {
            toast({ title: "Error", description: "Login required", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        try {
            if (asThread && canThread) {
                await replyAsThreadPost(postId, content.trim(), {
                    user_id: user.id,
                    author_name: user.username || "Anonymous",
                    author_email: user.email || undefined,
                });

                toast({
                    title: "Thread Updated",
                    description: "Your comment has been added to the thread!"
                });
            } else {
                await createComment({
                    post_id: postId,
                    user_id: user.id,
                    author_name: user.username || "Anonymous",
                    content: content.trim(),
                    gif_url: selectedGif || undefined,
                });

                toast({ title: "Posted", description: "Comment added!" });
            }

            setContent("");
            setSelectedGif(null);
            setIsExpanded(false);
            onSuccess?.();
        } catch (error) {
            console.error("Error posting comment:", error);
            toast({ title: "Error", description: "Failed to post", variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        setContent("");
        setSelectedGif(null);
        setIsExpanded(false);
        setShowSuggestions(false);
    };

    // Get user initial for avatar
    const getUserInitial = () => {
        return user?.username?.charAt(0).toUpperCase() || "?";
    };

    if (!user) {
        return (
            <div className="text-center py-4">
                <p className="text-gray-500 text-sm">
                    <a href="/login" className="text-green-400 hover:underline">Sign in</a> to leave a comment
                </p>
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Collapsed State */}
            {!isExpanded ? (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-full flex items-center gap-3 p-3 bg-black/30 border border-green-900/30 rounded-lg hover:border-green-700/50 transition-colors text-left"
                >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-green-900/30 border border-green-700/50 flex items-center justify-center text-xs font-medium text-green-400 flex-shrink-0">
                        {getUserInitial()}
                    </div>
                    <span className="text-gray-500 text-sm">Add a comment...</span>
                </button>
            ) : (
                /* Expanded State */
                <form onSubmit={handleSubmit} className="bg-black/30 border border-green-700/50 rounded-lg overflow-hidden">
                    {/* Header with Thread Toggle */}
                    <div className="flex items-center justify-between px-4 pt-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-green-900/30 border border-green-700/50 flex items-center justify-center text-xs font-medium text-green-400 flex-shrink-0">
                                {getUserInitial()}
                            </div>
                            <span className="text-sm text-green-400">@{user.username}</span>
                        </div>

                        {/* Thread Toggle */}
                        {canThread && (
                            <button
                                type="button"
                                onClick={() => setAsThread(!asThread)}
                                className={`text-xs px-2 py-1 rounded transition-colors ${asThread
                                    ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                    : "text-gray-500 hover:text-gray-400"
                                    }`}
                            >
                                {asThread ? "✓ Thread" : "As Thread"}
                            </button>
                        )}
                    </div>

                    {/* Textarea */}
                    <div className="relative px-4 py-3">
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={handleInputChange}
                            rows={3}
                            className="w-full bg-transparent text-gray-200 text-sm placeholder-gray-600 focus:outline-none resize-none"
                            placeholder={asThread ? "Write your thread update..." : "Write your comment... (@ to mention)"}
                            disabled={submitting}
                        />

                        {/* Mention Suggestions */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute left-4 right-4 bottom-full mb-2 bg-black border border-green-700 rounded-lg shadow-xl z-50 overflow-hidden">
                                <div className="px-3 py-1.5 bg-green-900/20 text-xs text-green-500 border-b border-green-700/50">
                                    Suggestions for "{mentionQuery}"
                                </div>
                                {suggestions.map((suggestion) => (
                                    <button
                                        key={suggestion.username}
                                        type="button"
                                        onClick={() => insertMention(suggestion.username)}
                                        className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-green-900/30 flex items-center gap-2"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center text-[10px] border border-green-700">
                                            {suggestion.avatar_url ? (
                                                <img src={suggestion.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                                            ) : (
                                                suggestion.username[0].toUpperCase()
                                            )}
                                        </div>
                                        <span className="font-medium">@{suggestion.username}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected GIF Preview */}
                    {selectedGif && (
                        <div className="px-4 pb-3">
                            <div className="relative inline-block">
                                <img
                                    src={selectedGif}
                                    alt="Selected GIF"
                                    className="max-h-32 rounded-lg border border-green-500/30"
                                />
                                <button
                                    type="button"
                                    onClick={removeGif}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-400"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between px-4 pb-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                            >
                                <X className="w-3 h-3" />
                                Cancel
                            </button>

                            {/* GIF Button */}
                            <button
                                type="button"
                                onClick={() => setShowGifPicker(true)}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-400 transition-colors ml-2"
                                title="Add GIF"
                            >
                                <Smile className="w-4 h-4" />
                                GIF
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || (!content.trim() && !selectedGif)}
                            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${asThread
                                ? "bg-green-600 hover:bg-green-500 text-black"
                                : "bg-green-600 hover:bg-green-500 text-black"
                                }`}
                        >
                            {submitting ? (
                                <>
                                    <div className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" />
                                    Posting...
                                </>
                            ) : (
                                <>
                                    <Send className="w-3 h-3" />
                                    {asThread ? "Post to Thread" : "Post"}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            )}

            {/* GIF Picker Modal */}
            {showGifPicker && (
                <GifPicker
                    onSelect={handleGifSelect}
                    onClose={() => setShowGifPicker(false)}
                />
            )}
        </div>
    );
}
