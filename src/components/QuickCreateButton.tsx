import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function QuickCreateButton() {
    const [isOpen, setIsOpen] = useState(false);
    const { user } = useAuth();

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Quick Menu */}
            {isOpen && (
                <div className="fixed bottom-20 right-4 z-50 space-y-2 animate-in slide-in-from-bottom-2">
                    <Link
                        to="/create"
                        className="flex items-center gap-3 px-4 py-3 bg-black border border-green-500 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                        onClick={() => setIsOpen(false)}
                    >
                        <span className="text-xl">📝</span>
                        <span>New Post</span>
                    </Link>
                    <Link
                        to="/create?mode=thread"
                        className="flex items-center gap-3 px-4 py-3 bg-black border border-green-500 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                        onClick={() => setIsOpen(false)}
                    >
                        <span className="text-xl">📎</span>
                        <span>New Thread</span>
                    </Link>
                </div>
            )}

            {/* FAB Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${isOpen
                        ? 'bg-red-600 border-red-500 rotate-45'
                        : 'bg-black border-green-500 shadow-[0_0_15px_rgba(0,255,0,0.5)] hover:shadow-[0_0_25px_rgba(0,255,0,0.8)]'
                    } border-2`}
                aria-label={isOpen ? "Close menu" : "Create post"}
            >
                {isOpen ? (
                    <X className="w-6 h-6 text-white" />
                ) : (
                    <Plus className="w-6 h-6 text-green-400" />
                )}
            </button>
        </>
    );
}
