import { useState, useRef } from "react";
import { Copy, Trash2, Pin, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageActionsProps {
    messageId: string;
    content: string | null;
    isOwnMessage: boolean;
    position: { x: number; y: number };
    onClose: () => void;
    onDelete?: (messageId: string) => void;
    onPin?: (messageId: string) => void;
}

export default function MessageActions({
    messageId,
    content,
    isOwnMessage,
    position,
    onClose,
    onDelete,
    onPin
}: MessageActionsProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!content) return;
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => {
                setCopied(false);
                onClose();
            }, 1000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const handleDelete = () => {
        onDelete?.(messageId);
        onClose();
    };

    const handlePin = () => {
        onPin?.(messageId);
        onClose();
    };

    // Calculate safe position (keep in viewport)
    const menuStyle = {
        left: Math.min(position.x, window.innerWidth - 160),
        top: Math.min(position.y, window.innerHeight - 150)
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50"
                onClick={onClose}
            />

            {/* Menu */}
            <div
                className="fixed z-50 w-40 bg-gray-900 border border-green-900/50 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                style={menuStyle}
            >
                {/* Copy */}
                {content && (
                    <button
                        onClick={handleCopy}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:bg-green-900/30 transition-colors"
                    >
                        <Copy className="w-4 h-4" />
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                )}

                {/* Pin (local only) */}
                <button
                    onClick={handlePin}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:bg-green-900/30 transition-colors"
                >
                    <Pin className="w-4 h-4" />
                    Pin
                </button>

                {/* Delete (own messages only) */}
                {isOwnMessage && onDelete && (
                    <button
                        onClick={handleDelete}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </button>
                )}
            </div>
        </>
    );
}

/**
 * Hook to handle message context menu
 */
export function useMessageActions() {
    const [activeAction, setActiveAction] = useState<{
        messageId: string;
        content: string | null;
        isOwnMessage: boolean;
        position: { x: number; y: number };
    } | null>(null);

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleLongPress = (
        messageId: string,
        content: string | null,
        isOwnMessage: boolean,
        e: React.PointerEvent | React.MouseEvent
    ) => {
        setActiveAction({
            messageId,
            content,
            isOwnMessage,
            position: { x: e.clientX, y: e.clientY }
        });
    };

    const handleContextMenu = (
        messageId: string,
        content: string | null,
        isOwnMessage: boolean,
        e: React.MouseEvent
    ) => {
        e.preventDefault();
        setActiveAction({
            messageId,
            content,
            isOwnMessage,
            position: { x: e.clientX, y: e.clientY }
        });
    };

    const closeActions = () => {
        setActiveAction(null);
    };

    return {
        activeAction,
        handleLongPress,
        handleContextMenu,
        closeActions
    };
}
