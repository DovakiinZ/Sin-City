import { useParams, Link, useNavigate } from "react-router-dom";
import { useProfile, getUserStats } from "@/hooks/useProfile";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { listPostsFromDb } from "@/data/posts";
import { supabase } from "@/lib/supabase";
import { UserPlus, UserMinus, Twitter, Instagram, X, Check } from "lucide-react";

interface FollowUser {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
}

const isValidUUID = (uuid: string) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
};

export default function UserProfile() {
    const { username } = useParams<{ username: string }>();
    const navigate = useNavigate();
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
            const rawUsername = username;
            if (!rawUsername) {
                setLookingUp(false);
                return;
            }

            // Normalize username: decode URI components and trim
            const searchName = decodeURIComponent(rawUsername).trim();


            try {
                let foundUser: any = null;

                // 1. Exact Username Match
                let { data: usernameMatch } = await supabase
                    .from('profiles')
                    .select('id, username, display_name, avatar_url, header_url, bio, website, location, created_at, twitter_username, instagram_username')
                    .ilike('username', searchName)
                    .limit(1);

                if (usernameMatch && usernameMatch.length > 0) {
                    foundUser = usernameMatch[0];
                }

                // 2. Exact Display Name Match
                if (!foundUser) {
                    const { data: displayMatch } = await supabase
                        .from('profiles')
                        .select('id, username, display_name, avatar_url, header_url, bio, website, location, created_at, twitter_username, instagram_username')
                        .ilike('display_name', searchName)
                        .limit(1);

                    if (displayMatch && displayMatch.length > 0) {
                        foundUser = displayMatch[0];
                    }
                }

                // 3. Partial/Wildcard Display Name Match
                if (!foundUser) {
                    const { data: wildcardMatch } = await supabase
                        .from('profiles')
                        .select('id, username, display_name, avatar_url, header_url, bio, website, location, created_at, twitter_username, instagram_username')
                        .ilike('display_name', `%${searchName}%`)
                        .limit(1);

                    if (wildcardMatch && wildcardMatch.length > 0) {
                        foundUser = wildcardMatch[0];
                    }
                }

                // 4. Post Author Lookup (Fallback)
                if (!foundUser) {
                    // Try exact match on author_name first for speed
                    let { data: postData } = await supabase
                        .from('posts')
                        .select('user_id, author_name')
                        .ilike('author_name', searchName)
                        .not('user_id', 'is', null)
                        .limit(1);

                    // If no exact match, try wildcard on author_name
                    if (!postData || postData.length === 0) {
                        const result = await supabase
                            .from('posts')
                            .select('user_id, author_name')
                            .ilike('author_name', `%${searchName}%`)
                            .not('user_id', 'is', null)
                            .limit(1);
                        postData = result.data;
                    }

                    if (postData && postData.length > 0 && postData[0].user_id) {

                        // Fetch the actual profile
                        const { data: profileData } = await supabase
                            .from('profiles')
                            .select('id, username, display_name, avatar_url, header_url, bio, website, location, created_at, twitter_username, instagram_username')
                            .eq('id', postData[0].user_id)
                            .single();

                        if (profileData) {
                            foundUser = profileData;
                        }
                    }
                }

                if (foundUser) {
                    setUserId(foundUser.id);
                    // Pre-load profile data if we fetched full object to avoid double-fetch
                    // (Note: useProfile hook will still fetch, but this ensures we have ID)

                    // Redirect logic
                    if (foundUser.username && normalize(foundUser.username) !== normalize(searchName)) {
                        navigate(`/user/${foundUser.username}`, { replace: true });
                    }
                }
            } catch (err) {
                console.error('[UserProfile] Critical error looking up user:', err);
            } finally {
                setLookingUp(false);
            }
        };


        const normalize = (s: string) => s ? s.toLowerCase().trim() : '';

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
                if (!isValidUUID(user.id) || !isValidUUID(profile.id)) {
                    console.warn('[UserProfile] Invalid UUIDs for follow check:', { userId: user.id, profileId: profile.id });
                    return;
                }

                const { data, error } = await supabase
                    .from('follows')
                    .select('follower_id')
                    .eq('follower_id', user.id)
                    .eq('following_id', profile.id)
                    .maybeSingle();

                if (error) {
                    console.error('[UserProfile] Error checking follow status:', JSON.stringify(error, null, 2));
                }
                console.log('[UserProfile] Follow check result:', { userId: user.id, profileId: profile.id, isFollowing: !!data });
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

    // Load followers list - only for logged-in users
    const loadFollowers = async () => {
        if (!user || !profile?.id) return;
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

    // Load following list - only for logged-in users
    const loadFollowing = async () => {
        if (!user || !profile?.id) return;
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

                // Send notification
                try {
                    // Get follower's profile name (current user)
                    const { data: followerProfile } = await supabase
                        .from('profiles')
                        .select('username')
                        .eq('id', user.id)
                        .single();

                    const followerName = followerProfile?.username || "Someone";

                    console.log('[handleFollow] Creating notification for user:', profile.id, 'from follower:', user.id);
                    const { error: notifError } = await supabase.from("notifications").insert([{
                        user_id: profile.id,
                        type: "follow",
                        content: {
                            follower: followerName,
                            followerId: user.id,
                            followerUsername: followerProfile?.username
                        },
                        read: false,
                    }]);

                    if (notifError) {
                        console.error('[handleFollow] Notification insert error:', notifError);
                    }
                } catch (notifErr) {
                    console.error("Error creating follow notification:", notifErr);
                }
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

    const handleListUnfollow = async (targetUserId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user?.id) return;

        try {
            const { error } = await supabase
                .from('follows')
                .delete()
                .eq('follower_id', user.id)
                .eq('following_id', targetUserId);

            if (!error) {
                // Update lists locally
                setFollowingList(prev => prev.filter(u => u.id !== targetUserId));
                setFollowingCount(prev => Math.max(0, prev - 1));

                // If we are on the profile of the user we just unfollowed, update the main button too
                if (targetUserId === profile?.id) {
                    setIsFollowing(false);
                    setFollowerCount(prev => Math.max(0, prev - 1));
                }
            }
        } catch (err) {
            console.error('List unfollow error:', err);
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
                                    {u.display_name && <div className="ascii-dim text-xs hidden">{u.display_name}</div>}
                                </div>
                                {title === "Following" && user?.id === profile?.id && (
                                    <button
                                        onClick={(e) => handleListUnfollow(u.id, e)}
                                        className="ml-auto p-2 hover:bg-red-900/30 text-ascii-dim hover:text-red-400 rounded transition-colors group"
                                        title="Unfollow"
                                    >
                                        <UserMinus className="w-4 h-4" />
                                    </button>
                                )}
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
                            <div className="flex-shrink-0">
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

                                {/* Display name removed as we act like it doesn't exist anymore */}

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
                                    {/* Followers - clickable only for logged-in users */}
                                    {user ? (
                                        <button
                                            className="text-center sm:text-left hover:bg-green-900/20 p-1 -m-1 rounded cursor-pointer"
                                            onClick={() => {
                                                loadFollowers();
                                                setShowFollowersModal(true);
                                            }}
                                        >
                                            <div className="ascii-highlight text-lg sm:text-xl">{followerCount}</div>
                                            <div className="ascii-dim text-xs">Followers</div>
                                        </button>
                                    ) : (
                                        <div className="text-center sm:text-left p-1 -m-1" title="Login to see followers">
                                            <div className="ascii-highlight text-lg sm:text-xl">{followerCount}</div>
                                            <div className="ascii-dim text-xs">Followers</div>
                                        </div>
                                    )}
                                    {/* Following - clickable only for logged-in users */}
                                    {user ? (
                                        <button
                                            className="text-center sm:text-left hover:bg-green-900/20 p-1 -m-1 rounded cursor-pointer"
                                            onClick={() => {
                                                loadFollowing();
                                                setShowFollowingModal(true);
                                            }}
                                        >
                                            <div className="ascii-highlight text-lg sm:text-xl">{followingCount}</div>
                                            <div className="ascii-dim text-xs">Following</div>
                                        </button>
                                    ) : (
                                        <div className="text-center sm:text-left p-1 -m-1" title="Login to see following">
                                            <div className="ascii-highlight text-lg sm:text-xl">{followingCount}</div>
                                            <div className="ascii-dim text-xs">Following</div>
                                        </div>
                                    )}
                                </div>

                                {/* Follow Button */}
                                {user && user.id !== profile.id && (
                                    <div className="mt-4 flex flex-col items-center sm:items-start gap-2">
                                        {isFollowing ? (
                                            <button
                                                onClick={handleUnfollow}
                                                disabled={followLoading}
                                                className="flex items-center gap-2 border border-green-700 bg-green-900/20 text-green-400 px-4 py-2 hover:bg-red-900/20 hover:border-red-700 hover:text-red-400 disabled:opacity-50 group"
                                            >
                                                <Check className="w-4 h-4 group-hover:hidden" />
                                                <UserMinus className="w-4 h-4 hidden group-hover:block" />
                                                <span className="group-hover:hidden">{followLoading ? "..." : "Followed"}</span>
                                                <span className="hidden group-hover:inline">{followLoading ? "..." : "Unfollow"}</span>
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
                                        to={`/ post / ${post.id}`}
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

            {/* Followers Modal - only for logged-in users */}
            {
                user && showFollowersModal && (
                    <FollowModal
                        title="Followers"
                        users={followersList}
                        onClose={() => setShowFollowersModal(false)}
                    />
                )
            }

            {/* Following Modal - only for logged-in users */}
            {
                user && showFollowingModal && (
                    <FollowModal
                        title="Following"
                        users={followingList}
                        onClose={() => setShowFollowingModal(false)}
                    />
                )
            }
        </div >
    );
}
