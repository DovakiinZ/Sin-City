import { Link } from "react-router-dom";
import { Check, X, UserPlus, User } from "lucide-react";
import { usePendingFollowRequests } from "@/hooks/useFollow";

interface FollowRequestsProps {
    /** Called after a request is approved or removed, so counts can refresh. */
    onResponded?: (approved: boolean) => void;
}

/**
 * Incoming follow requests. Approving one also unlocks DMs between the two
 * users; removing it deletes the request entirely.
 */
export default function FollowRequests({ onResponded }: FollowRequestsProps) {
    const { requests, loading, respond } = usePendingFollowRequests();

    const handle = async (followerId: string, approve: boolean) => {
        const ok = await respond(followerId, approve);
        if (ok) onResponded?.(approve);
    };

    if (loading || requests.length === 0) return null;

    return (
        <div className="mt-4 pt-4 border-t border-green-800/40">
            <h3 className="flex items-center gap-2 text-sm font-medium text-green-400 mb-3">
                <UserPlus className="w-4 h-4" />
                Follow requests
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-600 text-black rounded-full">
                    {requests.length}
                </span>
            </h3>

            <p className="text-xs text-gray-500 mb-3">
                Approve a request to let them follow you and message you in DMs.
            </p>

            <div className="space-y-2">
                {requests.map((req) => (
                    <div
                        key={req.follower_id}
                        className="flex items-center gap-3 p-2 bg-black/30 border border-green-900/40 rounded-lg"
                    >
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                            {req.avatar_url ? (
                                <img
                                    src={req.avatar_url}
                                    alt={req.username || "user"}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-gray-600" />
                                </div>
                            )}
                        </div>

                        <Link
                            to={`/user/${req.username}`}
                            className="flex-1 min-w-0 hover:text-green-300"
                        >
                            <p className="text-sm text-green-400 truncate">@{req.username}</p>
                            {req.display_name && (
                                <p className="text-xs text-gray-500 truncate">{req.display_name}</p>
                            )}
                        </Link>

                        <button
                            onClick={() => handle(req.follower_id, true)}
                            className="p-2 rounded-lg bg-green-600 text-black hover:bg-green-500 transition-colors"
                            title="Approve follow request"
                            aria-label={`Approve follow request from ${req.username}`}
                        >
                            <Check className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => handle(req.follower_id, false)}
                            className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-700/50 transition-colors"
                            title="Remove follow request"
                            aria-label={`Remove follow request from ${req.username}`}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
