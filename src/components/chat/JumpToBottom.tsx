import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface JumpToBottomProps {
    visible: boolean;
    onClick: () => void;
    unreadCount?: number;
}

export default function JumpToBottom({ visible, onClick, unreadCount }: JumpToBottomProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "fixed right-4 z-30 flex items-center gap-2 px-3 py-2",
                "bg-green-600 hover:bg-green-500 text-black rounded-full shadow-lg",
                "transition-all duration-300 transform",
                visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4 pointer-events-none"
            )}
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 70px)" }}
        >
            <ArrowDown className="w-4 h-4" />
            {unreadCount && unreadCount > 0 && (
                <span className="text-xs font-medium">{unreadCount} new</span>
            )}
        </button>
    );
}
