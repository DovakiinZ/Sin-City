import { useState } from "react";
import { Search, Plus, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import SessionItem, { SessionData } from "./SessionItem";

interface SessionsListProps {
    sessions: SessionData[];
    loading: boolean;
    activeSessionId?: string;
    onSelectSession: (sessionId: string) => void;
    onNewChat?: () => void;
    isMobile?: boolean;
}

export default function SessionsList({
    sessions,
    loading,
    activeSessionId,
    onSelectSession,
    onNewChat,
    isMobile
}: SessionsListProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredSessions = sessions.filter(s =>
        s.otherUserName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className={cn(
            "flex flex-col h-full bg-black",
            !isMobile && "border-r border-green-900/30"
        )}>
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-green-900/30">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-mono text-lg text-green-400 flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        Messages
                    </h2>
                    {onNewChat && (
                        <button
                            onClick={onNewChat}
                            className="p-2 text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search conversations..."
                        className="w-full bg-gray-900/50 border border-green-900/30 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-green-500/50"
                    />
                </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : filteredSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        {sessions.length === 0 ? (
                            <>
                                <MessageCircle className="w-12 h-12 text-gray-700 mb-3" />
                                <p className="text-gray-500 text-sm">No conversations yet</p>
                                <p className="text-gray-600 text-xs mt-1">Start a new chat to get going</p>
                            </>
                        ) : (
                            <>
                                <Search className="w-8 h-8 text-gray-700 mb-2" />
                                <p className="text-gray-500 text-sm">No matches found</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div>
                        {filteredSessions.map((session) => (
                            <SessionItem
                                key={session.id}
                                session={session}
                                isActive={session.id === activeSessionId}
                                onClick={() => onSelectSession(session.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
