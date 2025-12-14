import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface MentionInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    className?: string;
}

interface User {
    id: string;
    username: string;
    avatar_url?: string;
}

export default function MentionInput({
    value,
    onChange,
    placeholder,
    rows = 4,
    disabled = false,
    className = "",
}: MentionInputProps) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [cursorPosition, setCursorPosition] = useState(0);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Search for users when typing @
    useEffect(() => {
        const searchUsers = async () => {
            if (!searchTerm) {
                setSuggestions([]);
                return;
            }

            const { data } = await supabase
                .from("profiles")
                .select("id, username, avatar_url")
                .ilike("username", `${searchTerm}%`)
                .limit(5);

            setSuggestions(data || []);
        };

        searchUsers();
    }, [searchTerm]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursor = e.target.selectionStart;
        setCursorPosition(cursor);
        onChange(newValue);

        // Check if we're typing a mention
        const textBeforeCursor = newValue.slice(0, cursor);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

        if (mentionMatch) {
            setSearchTerm(mentionMatch[1]);
            setShowSuggestions(true);
            setSelectedIndex(0);
        } else {
            setShowSuggestions(false);
            setSearchTerm("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === "Enter" && showSuggestions) {
            e.preventDefault();
            selectUser(suggestions[selectedIndex]);
        } else if (e.key === "Escape") {
            setShowSuggestions(false);
        }
    };

    const selectUser = (user: User) => {
        const textBeforeCursor = value.slice(0, cursorPosition);
        const textAfterCursor = value.slice(cursorPosition);

        // Find the @ position
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        if (mentionMatch) {
            const startPos = cursorPosition - mentionMatch[0].length;
            const newValue = value.slice(0, startPos) + `@${user.username} ` + textAfterCursor;
            onChange(newValue);

            // Move cursor after the inserted mention
            setTimeout(() => {
                if (textareaRef.current) {
                    const newCursor = startPos + user.username.length + 2;
                    textareaRef.current.setSelectionRange(newCursor, newCursor);
                    textareaRef.current.focus();
                }
            }, 0);
        }

        setShowSuggestions(false);
        setSearchTerm("");
    };

    return (
        <div className="relative">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                rows={rows}
                className={`w-full bg-background border border-ascii-border p-3 ascii-text focus:border-ascii-highlight focus:outline-none resize-none ${className}`}
                placeholder={placeholder}
                disabled={disabled}
            />

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 z-50 bg-black border-2 border-green-500 rounded-lg mt-1 shadow-lg shadow-green-900/50 max-h-48 overflow-y-auto">
                    <div className="p-2 text-xs text-green-600 border-b border-green-700">
                        Select a user to mention
                    </div>
                    {suggestions.map((user, index) => (
                        <button
                            key={user.id}
                            onClick={() => selectUser(user)}
                            className={`w-full flex items-center gap-3 p-3 hover:bg-green-900/30 transition-colors ${index === selectedIndex ? "bg-green-900/40" : ""
                                }`}
                        >
                            {user.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt={user.username}
                                    className="w-8 h-8 rounded-full border border-green-600"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full border border-green-600 bg-green-900/30 flex items-center justify-center text-green-400">
                                    {user.username[0]?.toUpperCase()}
                                </div>
                            )}
                            <span className="text-green-400 font-mono">@{user.username}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Hint about mentions */}
            <div className="text-xs text-green-700 mt-1">
                Type @ to mention users
            </div>
        </div>
    );
}
