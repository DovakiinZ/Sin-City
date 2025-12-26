import { useState, useRef, KeyboardEvent } from "react";
import { Send, Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PendingMedia {
    url: string;
    type: 'image' | 'video' | 'gif';
    file?: File;
}

interface ChatInputProps {
    onSend: (content: string, media?: PendingMedia) => void;
    onOpenMediaPicker: () => void;
    disabled?: boolean;
    placeholder?: string;
    pendingMedia?: PendingMedia | null;
    onClearMedia?: () => void;
    isUploading?: boolean;
}

export default function ChatInput({
    onSend,
    onOpenMediaPicker,
    disabled,
    placeholder = "Type a message...",
    pendingMedia,
    onClearMedia,
    isUploading
}: ChatInputProps) {
    const [text, setText] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if (disabled || isUploading) return;
        if (!text.trim() && !pendingMedia) return;

        onSend(text.trim(), pendingMedia || undefined);
        setText("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize textarea
    const handleInput = () => {
        if (!inputRef.current) return;
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = Math.min(120, inputRef.current.scrollHeight) + 'px';
    };

    const canSend = (text.trim() || pendingMedia) && !disabled && !isUploading;

    return (
        <div className="border-t border-green-900/30 bg-black/80 backdrop-blur-sm safe-area-bottom">
            {/* Pending media preview */}
            {pendingMedia && (
                <div className="px-3 pt-3">
                    <div className="relative inline-block">
                        {pendingMedia.type === 'video' ? (
                            <video
                                src={pendingMedia.url}
                                className="h-20 w-20 object-cover rounded-lg border border-green-900/50"
                            />
                        ) : (
                            <img
                                src={pendingMedia.url}
                                alt="Preview"
                                className="h-20 w-20 object-cover rounded-lg border border-green-900/50"
                            />
                        )}
                        <button
                            onClick={onClearMedia}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                        >
                            <X className="w-3 h-3 text-white" />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex items-end gap-2 p-3">
                {/* Media picker button */}
                <button
                    onClick={onOpenMediaPicker}
                    disabled={disabled || isUploading}
                    className={cn(
                        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        "bg-green-900/40 text-green-400 hover:bg-green-900/60",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    {isUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Plus className="w-5 h-5" />
                    )}
                </button>

                {/* Text input */}
                <div className="flex-1 relative">
                    <textarea
                        ref={inputRef}
                        value={text}
                        onChange={(e) => { setText(e.target.value); handleInput(); }}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        rows={1}
                        className={cn(
                            "w-full bg-gray-900/60 border border-green-900/40 rounded-2xl",
                            "px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500",
                            "focus:outline-none focus:border-green-500/50",
                            "resize-none overflow-hidden font-mono",
                            "disabled:opacity-50"
                        )}
                        style={{ maxHeight: '120px' }}
                    />
                </div>

                {/* Send button */}
                <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className={cn(
                        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        canSend
                            ? "bg-green-600 text-black hover:bg-green-500"
                            : "bg-gray-800 text-gray-600 cursor-not-allowed"
                    )}
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
