import { useState, useEffect, useCallback } from "react";
import { X, Search, MessageCircle, Loader2, User, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface UserResult {
    id: string;
    username: string;
    avatar_url: string | null;
}

interface StartChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartChat: (userId: string, username: string) => void;
}

export default function StartChatModal({ isOpen, onClose, onStartChat }: StartChatModalProps) {
    const { user } = useAuth();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<UserResult[]>([]);
    const [recentUsers, setRecentUsers] = useState<UserResult[]>([]);
    const [suggestedUsers, setSuggestedUsers] = useState<UserResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingRecent, setLoadingRecent] = useState(true);

    // Load recent and suggested users on mount
    useEffect(() => {
        if (!isOpen || !user) return;

        const loadInitialUsers = async () => {
            setLoadingRecent(true);
            try {
                // Get recent chat partners
                const { data: sessions } = await supabase
                    .from("chat_sessions")
                    .select("participant_1, participant_2, updated_at")
                    .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
                    .order("updated_at", { ascending: false })
                    .limit(5);

                if (sessions && sessions.length > 0) {
                    const otherUserIds = sessions.map(s =>
                        s.participant_1 === user.id ? s.participant_2 : s.participant_1
                    );

                    const { data: profiles } = await supabase
                        .from("profiles")
                        .select("id, username, avatar_url")
                        .in("id", otherUserIds)
                        .not("username", "is", null);

                    setRecentUsers(profiles || []);
                }

                // Get suggested users from followers/following only
                // Get people we follow
                const { data: following } = await supabase
                    .from("follows")
                    .select("following_id")
                    .eq("follower_id", user.id)
                    .limit(10);

                // Get people who follow us
                const { data: followers } = await supabase
                    .from("follows")
                    .select("follower_id")
                    .eq("following_id", user.id)
                    .limit(10);

                // Combine and dedupe
                const followingIds = following?.map(f => f.following_id) || [];
                const followerIds = followers?.map(f => f.follower_id) || [];
                const allConnections = [...new Set([...followingIds, ...followerIds])];

                if (allConnections.length > 0) {
                    const { data: suggested } = await supabase
                        .from("profiles")
                        .select("id, username, avatar_url")
                        .in("id", allConnections)
                        .not("username", "is", null)
                        .limit(6);

                    // Filter out any profiles without proper usernames (anonymous/temp users)
                    const validSuggested = (suggested || []).filter(u =>
                        u.username && !u.username.startsWith('yt_') && u.username.length > 3
                    );
                    setSuggestedUsers(validSuggested);
                } else {
                    setSuggestedUsers([]);
                }
            } catch (error) {
                console.error("Error loading users:", error);
            } finally {
                setLoadingRecent(false);
            }
        };

        loadInitialUsers();
    }, [isOpen, user]);

    // Search users with debounce
    const searchUsers = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim() || !user) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, username, avatar_url")
                .neq("id", user.id)
                .ilike("username", `%${searchQuery}%`)
                .limit(10);

            if (error) throw error;
            setResults(data || []);
        } catch (error) {
            console.error("Search error:", error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query) searchUsers(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, searchUsers]);

    const handleSelectUser = (selectedUser: UserResult) => {
        onStartChat(selectedUser.id, selectedUser.username);
        onClose();
        setQuery("");
        setResults([]);
    };

    if (!isOpen) return null;

    const showSearchResults = query.trim().length > 0;
    const displayUsers = showSearchResults ? results :
        (recentUsers.length > 0 ? recentUsers : suggestedUsers);

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/70 z-50 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-gray-900 border border-green-900/50 rounded-xl shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-green-900/30">
                        <h2 className="font-mono text-lg text-green-400 flex items-center gap-2">
                            <MessageCircle className="w-5 h-5" />
                            New Message
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="p-4 border-b border-green-900/20">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by username..."
                                autoFocus
                                className="w-full bg-black/50 border border-green-900/40 rounded-lg pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-green-500/50 font-mono"
                            />
                            {loading && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 animate-spin" />
                            )}
                        </div>
                    </div>

                    {/* Results */}
                    <div className="max-h-[50vh] overflow-y-auto">
                        {loadingRecent && !showSearchResults ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
                            </div>
                        ) : displayUsers.length === 0 ? (
                            <div className="py-8 text-center">
                                {showSearchResults ? (
                                    <>
                                        <User className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                        <p className="text-gray-500 text-sm">No users found</p>
                                        <p className="text-gray-600 text-xs mt-1">Try a different username</p>
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                        <p className="text-gray-500 text-sm">Search for a user</p>
                                        <p className="text-gray-600 text-xs mt-1">Start typing to find people</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Section label */}
                                {!showSearchResults && (
                                    <div className="px-4 py-2 flex items-center gap-2 text-xs text-gray-500 border-b border-green-900/10">
                                        <Clock className="w-3 h-3" />
                                        {recentUsers.length > 0 ? 'Recent' : 'Following'}
                                    </div>
                                )}

                                {/* User list */}
                                <div className="py-1">
                                    {displayUsers.map((u) => (
                                        <button
                                            key={u.id}
                                            onClick={() => handleSelectUser(u)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-900/20 transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                                                {u.avatar_url ? (
                                                    <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <User className="w-5 h-5 text-gray-600" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 text-left">
                                                <p className="font-mono text-sm text-green-400">@{u.username}</p>
                                            </div>
                                            <MessageCircle className="w-4 h-4 text-gray-600" />
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
