import { useParams, Link } from "react-router-dom";
import { useProfile, getUserStats } from "@/hooks/useProfile";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { listPostsFromDb } from "@/data/posts";
import { supabase } from "@/lib/supabase";
import { UserPlus, UserMinus, Twitter, Instagram, X } from "lucide-react";

interface FollowUser {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
}

export default function UserProfile() {
    const { username } = useParams<{ username: string }>();
    const { user } = useAuth();
    const [userId, setUserId] = useState<string | undefined>();
    const { profile, loading } = useProfile(userId);
    const [stats, setStats] = useState({ posts: 0, comments: 0 });
    const [userPosts, setUserPosts] = useState<any[]>([]);
    const [lookingUp, setLookingUp] = useState(true);

    // Follow system state
    const [isFollowing, setIsFollowing] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [followLoading, setFollowLoading] = useState(false);

    // Modal state for followers/following list
    const [showFollowersModal, setShowFollowersModal] = useState(false);
    const [showFollowingModal, setShowFollowingModal] = useState(false);
    const [followersList, setFollowersList] = useState<FollowUser[]>([]);
    const [followingList, setFollowingList] = useState<FollowUser[]>([]);
    const [loadingList, setLoadingList] = useState(false);

    // Look up user ID by username or display_name
    useEffect(() => {
        const lookupUser = async () => {
            if (!username) {
                setLookingUp(false);
                return;
            }

            console.log('[UserProfile] Looking up user:', username);

            try {
                // First try exact match on username
                let { data } = await supabase
                    .from('profiles')
                    .select('id, username, display_name')
                    .ilike('username', username)
                    .limit(1);

                let foundUser = data && data.length > 0 ? data[0] : null;

                // If not found, try display_name
                if (!foundUser) {
                    const result = await supabase
                        .from('profiles')
                        .select('id, username, display_name')
                        .ilike('display_name', username)
                        .limit(1);
                    foundUser = result.data && result.data.length > 0 ? result.data[0] : null;
                }

                // If still not found, try partial match on username
                if (!foundUser) {
                    const result = await supabase
                        .from('profiles')
                        .select('id, username, display_name')
                        .ilike('username', `%${username}%`)
                        .limit(1);
                    foundUser = result.data && result.data.length > 0 ? result.data[0] : null;
                }

                if (foundUser) {
                    console.log('[UserProfile] Found user:', foundUser);
                    setUserId(foundUser.id);
                } else {
                    console.log('[UserProfile] User not found for:', username);
                }
            } catch (err) {
                console.error('[UserProfile] Error looking up user:', err);
            } finally {
                setLookingUp(false);
            }
        };

        lookupUser();
    }, [username]);

    // Check follow status and get counts
    useEffect(() => {
        const checkFollowStatus = async () => {
            if (!profile?.id) return;

            // Get follower count
            const { count: followers } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('following_id', profile.id);
            setFollowerCount(followers || 0);

            // Get following count
            const { count: following } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('follower_id', profile.id);
            setFollowingCount(following || 0);

            // Check if current user follows this profile
            if (user?.id && user.id !== profile.id) {
                const { data } = await supabase
                    .from('follows')
                    .select('id')
                    .eq('follower_id', user.id)
                    .eq('following_id', profile.id)
                    .single();
                setIsFollowing(!!data);
            }
        };

        checkFollowStatus();
    }, [profile?.id, user?.id]);

    useEffect(() => {
        const loadUserData = async () => {
            if (profile?.id) {
                const userStats = await getUserStats(profile.id);
                setStats(userStats);

                // Load user's posts - match by user_id OR by display_name
                const posts = await listPostsFromDb();
                const filtered = posts.filter((p) =>
                    p.user_id === profile.id ||
                    (profile.display_name && p.author_name?.toLowerCase() === profile.display_name?.toLowerCase()) ||
                    (profile.username && p.author_name?.toLowerCase() === profile.username?.toLowerCase())
                );
                setUserPosts(filtered);
            }
        };
        loadUserData();
    }, [profile]);

    // Load followers list
    const loadFollowers = async () => {
        if (!profile?.id) return;
        setLoadingList(true);
        try {
            // First get follower IDs
            const { data: followData } = await supabase
                .from('follows')
                .select('follower_id')
                .eq('following_id', profile.id);

            if (followData && followData.length > 0) {
                const followerIds = followData.map(f => f.follower_id);
                // Then fetch profiles for those IDs
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, display_name, avatar_url')
                    .in('id', followerIds);
                setFollowersList(profiles || []);
            } else {
                setFollowersList([]);
            }
        } catch (err) {
            console.error('Error loading followers:', err);
        } finally {
            setLoadingList(false);
        }
    };

    // Load following list
    const loadFollowing = async () => {
        if (!profile?.id) return;
        setLoadingList(true);
        try {
            // First get following IDs
            const { data: followData } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', profile.id);

            if (followData && followData.length > 0) {
                const followingIds = followData.map(f => f.following_id);
                // Then fetch profiles for those IDs
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, display_name, avatar_url')
                    .in('id', followingIds);
                setFollowingList(profiles || []);
            } else {
                setFollowingList([]);
            }
        } catch (err) {
            console.error('Error loading following:', err);
        } finally {
            setLoadingList(false);
        }
    };

    const handleFollow = async () => {
        if (!user?.id || !profile?.id) return;
        setFollowLoading(true);

        try {
            const { error } = await supabase
                .from('follows')
                .insert({ follower_id: user.id, following_id: profile.id });

            if (!error) {
                setIsFollowing(true);
                setFollowerCount(prev => prev + 1);
            }
        } catch (err) {
            console.error('Follow error:', err);
        } finally {
            setFollowLoading(false);
        }
    };

    const handleUnfollow = async () => {
        if (!user?.id || !profile?.id) return;
        setFollowLoading(true);

        try {
            const { error } = await supabase
                .from('follows')
                .delete()
                .eq('follower_id', user.id)
                .eq('following_id', profile.id);

            if (!error) {
                setIsFollowing(false);
                setFollowerCount(prev => prev - 1);
            }
        } catch (err) {
            console.error('Unfollow error:', err);
        } finally {
            setFollowLoading(false);
        }
    };

    // Modal component for followers/following list
    const FollowModal = ({
        title,
        users,
        onClose
    }: {
        title: string;
        users: FollowUser[];
        onClose: () => void;
    }) => (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="ascii-box bg-black p-4 max-w-md w-full max-h-[70vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="ascii-highlight text-lg">{title}</h3>
                    <button onClick={onClose} className="ascii-dim hover:ascii-highlight">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {loadingList ? (
                    <div className="ascii-dim text-center py-4">Loading...</div>
                ) : users.length === 0 ? (
                    <div className="ascii-dim text-center py-4">No users yet</div>
                ) : (
                    <div className="space-y-3">
                        {users.map((u) => (
                            <Link
                                key={u.id}
                                to={`/user/${u.username || u.id}`}
                                onClick={onClose}
                                className="flex items-center gap-3 p-2 hover:bg-green-900/20 border border-transparent hover:border-green-700"
                            >
                                {u.avatar_url ? (
                                    <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-green-700" />
                                ) : (
                                    <div className="w-10 h-10 rounded-lg border border-green-700 bg-green-900/30 flex items-center justify-center">
                                        <span className="text-lg text-green-500">{(u.username || "?")[0]?.toUpperCase()}</span>
                                    </div>
                                )}
                                <div>
                                    <div className="ascii-highlight">@{u.username || "anonymous"}</div>
                                    {u.display_name && <div className="ascii-dim text-xs">{u.display_name}</div>}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    if (loading || lookingUp) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="ascii-dim">Loading profile...</div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-lg w-full">
                    <BackButton />
                    <div className="ascii-box p-6 mt-4 text-center">
                        <div className="text-red-400 mb-4">Profile not found</div>
                        <Link to="/" className="ascii-nav-link hover:ascii-highlight">
                            ← Back to home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <BackButton />

                {/* Profile Header with Banner */}
                <div className="ascii-box overflow-hidden">
                    {/* Header Banner */}
                    {profile.header_url ? (
                        <div className="h-32 sm:h-48 w-full overflow-hidden">
                            <img
                                src={profile.header_url}
                                alt="Profile header"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    ) : (
                        <div className="h-20 sm:h-32 w-full bg-gradient-to-r from-green-900/30 via-green-800/20 to-green-900/30" />
                    )}

                    <div className="p-4 sm:p-6 -mt-12 sm:-mt-16">
                        <h2 className="ascii-highlight text-lg sm:text-xl mb-4 text-center sm:text-left border-b border-ascii-border pb-2 mt-12 sm:mt-16">
                            USER PROFILE
                        </h2>

                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                            {/* Profile Avatar */}
                            <div className="flex-shrink-0 -mt-8 sm:-mt-12">
                                {profile.avatar_url ? (
                                    <img
                                        src={profile.avatar_url}
                                        alt={profile.username || "User"}
                                        className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg border-4 border-black object-cover ring-2 ring-green-700"
                                    />
                                ) : (
                                    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg border-4 border-black bg-black ring-2 ring-green-700 flex items-center justify-center">
                                        <span className="text-4xl sm:text-5xl text-green-500">
                                            {(profile.username || "?")[0]?.toUpperCase()}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Profile Info */}
                            <div className="flex-1 text-center sm:text-left w-full">
                                <div className="ascii-highlight text-xl sm:text-2xl mb-1">
                                    @{profile.username || "anonymous"}
                                </div>

                                {/* Display name if different from username */}
                                {profile.display_name && profile.display_name !== profile.username && (
                                    <div className="ascii-dim text-sm mb-2">{profile.display_name}</div>
                                )}

                                {profile.bio && (
                                    <div className="ascii-text mb-4 text-sm sm:text-base">{profile.bio}</div>
                                )}

                                <div className="ascii-dim text-xs sm:text-sm space-y-1">
                                    {profile.location && <div>📍 {profile.location}</div>}
                                    {profile.website && (
                                        <div className="break-all">
                                            🔗{" "}
                                            <a
                                                href={profile.website}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="ascii-nav-link hover:ascii-highlight"
                                            >
                                                {profile.website}
                                            </a>
                                        </div>
                                    )}
                                    <div>
                                        📅 Joined {new Date(profile.created_at).toLocaleDateString()}
                                    </div>
                                </div>

                                {/* Social Media Links */}
                                {(profile.twitter_username || profile.instagram_username) && (
                                    <div className="flex gap-3 mt-3 justify-center sm:justify-start">
                                        {profile.twitter_username && (
                                            <a
                                                href={`https://twitter.com/${profile.twitter_username}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
                                            >
                                                <Twitter className="w-4 h-4" />
                                                @{profile.twitter_username}
                                            </a>
                                        )}
                                        {profile.instagram_username && (
                                            <a
                                                href={`https://instagram.com/${profile.instagram_username}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-pink-400 hover:text-pink-300 text-sm"
                                            >
                                                <Instagram className="w-4 h-4" />
                                                @{profile.instagram_username}
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* Stats - Clickable followers/following */}
                                <div className="grid grid-cols-4 gap-2 sm:flex sm:gap-6 mt-4 pt-4 border-t border-ascii-border">
                                    <div className="text-center sm:text-left">
                                        <div className="ascii-highlight text-lg sm:text-xl">{stats.posts}</div>
                                        <div className="ascii-dim text-xs">Posts</div>
                                    </div>
                                    <div className="text-center sm:text-left">
                                        <div className="ascii-highlight text-lg sm:text-xl">{stats.comments}</div>
                                        <div className="ascii-dim text-xs">Comments</div>
                                    </div>
                                    <button
                                        className="text-center sm:text-left hover:bg-green-900/20 p-1 -m-1 rounded"
                                        onClick={() => {
                                            loadFollowers();
                                            setShowFollowersModal(true);
                                        }}
                                    >
                                        <div className="ascii-highlight text-lg sm:text-xl">{followerCount}</div>
                                        <div className="ascii-dim text-xs">Followers</div>
                                    </button>
                                    <button
                                        className="text-center sm:text-left hover:bg-green-900/20 p-1 -m-1 rounded"
                                        onClick={() => {
                                            loadFollowing();
                                            setShowFollowingModal(true);
                                        }}
                                    >
                                        <div className="ascii-highlight text-lg sm:text-xl">{followingCount}</div>
                                        <div className="ascii-dim text-xs">Following</div>
                                    </button>
                                </div>

                                {/* Follow Button */}
                                {user && user.id !== profile.id && (
                                    <div className="mt-4 flex justify-center sm:justify-start">
                                        {isFollowing ? (
                                            <button
                                                onClick={handleUnfollow}
                                                disabled={followLoading}
                                                className="flex items-center gap-2 border border-red-700 text-red-400 px-4 py-2 hover:bg-red-900/20 disabled:opacity-50"
                                            >
                                                <UserMinus className="w-4 h-4" />
                                                {followLoading ? "..." : "Unfollow"}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleFollow}
                                                disabled={followLoading}
                                                className="flex items-center gap-2 border border-green-700 ascii-nav-link hover:ascii-highlight px-4 py-2 disabled:opacity-50"
                                            >
                                                <UserPlus className="w-4 h-4" />
                                                {followLoading ? "..." : "Follow"}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* User's Posts */}
                <div className="ascii-box p-6">
                    <pre className="ascii-highlight text-sm mb-4">RECENT POSTS</pre>

                    {userPosts.length === 0 ? (
                        <div className="ascii-dim text-center py-8">No posts yet</div>
                    ) : (
                        <div className="space-y-4">
                            {userPosts.map((post) => (
                                <div key={post.id} className="border-l-2 border-ascii-border pl-4">
                                    <Link
                                        to={`/post/${post.id}`}
                                        className="ascii-highlight hover:underline"
                                    >
                                        {post.title}
                                    </Link>
                                    <div className="ascii-dim text-xs mt-1">
                                        {new Date(post.created_at).toLocaleDateString()} • {post.view_count || 0} views
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Followers Modal */}
            {showFollowersModal && (
                <FollowModal
                    title="Followers"
                    users={followersList}
                    onClose={() => setShowFollowersModal(false)}
                />
            )}

            {/* Following Modal */}
            {showFollowingModal && (
                <FollowModal
                    title="Following"
                    users={followingList}
                    onClose={() => setShowFollowingModal(false)}
                />
            )}
        </div>
    );
}
