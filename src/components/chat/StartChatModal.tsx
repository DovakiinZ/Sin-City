import { useState, useEffect, useMemo } from "react";
import { X, Search, MessageCircle, Loader2, User, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

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
    const [eligibleUsers, setEligibleUsers] = useState<UserResult[]>([]);
    const [loading, setLoading] = useState(true);

    // You can only DM people you have an approved follow with (in either
    // direction), so the whole list is loaded up front and filtered locally.
    useEffect(() => {
        if (!isOpen || !user) return;

        const loadEligibleUsers = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.rpc("get_dm_eligible_users");
                if (error) throw error;

                setEligibleUsers(
                    ((data || []) as UserResult[])
                        .filter(u => !!u.username)
                        .sort((a, b) => a.username.localeCompare(b.username))
                );
            } catch (error) {
                console.error("Error loading DM-eligible users:", error);
                setEligibleUsers([]);
            } finally {
                setLoading(false);
            }
        };

        loadEligibleUsers();
    }, [isOpen, user]);

    const showSearchResults = query.trim().length > 0;

    const displayUsers = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return eligibleUsers;
        return eligibleUsers.filter(u => u.username.toLowerCase().includes(q));
    }, [query, eligibleUsers]);

    const handleSelectUser = (selectedUser: UserResult) => {
        onStartChat(selectedUser.id, selectedUser.username);
        onClose();
        setQuery("");
    };

    if (!isOpen) return null;

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
                                placeholder="Search your approved connections..."
                                autoFocus
                                className="w-full bg-black/50 border border-green-900/40 rounded-lg pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-green-500/50 font-mono"
                            />
                            {loading && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 animate-spin" />
                            )}
                        </div>
                        <p className="text-[11px] text-gray-600 mt-2">
                            You can only message people whose follow request between you has been approved.
                        </p>
                    </div>

                    {/* Results */}
                    <div className="max-h-[50vh] overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
                            </div>
                        ) : displayUsers.length === 0 ? (
                            <div className="py-8 text-center px-6">
                                {showSearchResults ? (
                                    <>
                                        <User className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                        <p className="text-gray-500 text-sm">No match</p>
                                        <p className="text-gray-600 text-xs mt-1">
                                            Only your approved connections are listed here
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <Users className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                        <p className="text-gray-500 text-sm">No one to message yet</p>
                                        <p className="text-gray-600 text-xs mt-1">
                                            Follow someone and wait for them to approve, or approve a
                                            follow request on your profile.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Section label */}
                                {!showSearchResults && (
                                    <div className="px-4 py-2 flex items-center gap-2 text-xs text-gray-500 border-b border-green-900/10">
                                        <Users className="w-3 h-3" />
                                        Approved connections ({displayUsers.length})
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
