import { useParams, Link, useNavigate } from "react-router-dom";
import { useProfile, getUserStats } from "@/hooks/useProfile";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import PostCard from "@/components/PostCard";
import { listPostsFromDb } from "@/data/posts";
import { supabase } from "@/lib/supabase";
import { UserPlus, UserMinus, Twitter, Instagram, X, Check, Edit2, LogOut, MessageCircle } from "lucide-react";
import { useSessions } from "@/hooks/useSessions";
import MessagingPanel from "@/components/messaging/MessagingPanel";

interface FollowUser {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
}

interface UserPost {
    slug: string;
    postId: string;
    title: string;
    content: string;
    date: string;
    rawDate: string;
    author?: string;
    authorAvatar?: string;
    authorUsername?: string;
    userId?: string;
    isPinned?: boolean;
    isHtml?: boolean;
    viewCount?: number;
    attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
}

const isValidUUID = (uuid: string) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
};

export default function UserProfile() {
    const { username } = useParams<{ username: string }>();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [userId, setUserId] = useState<string | undefined>();
    const { profile, loading } = useProfile(userId);
    const [stats, setStats] = useState({ posts: 0, comments: 0 });
    const [userPosts, setUserPosts] = useState<UserPost[]>([]);
    const [lookingUp, setLookingUp] = useState(true);

    // Is this the current user's own profile?
    const isOwnProfile = user?.id && profile?.id && user.id === profile.id;

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

    // DM state
    const { startSession } = useSessions();
    const [startingDM, setStartingDM] = useState(false);
    const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

    // Look up user ID by username
    useEffect(() => {
        const lookupUser = async () => {
            const rawUsername = username;
            if (!rawUsername) {
                setLookingUp(false);
                return;
            }

            const searchName = decodeURIComponent(rawUsername).trim();

            try {
                let foundUser: any = null;

                // 1. Exact Username Match
                let { data: usernameMatch } = await supabase
                    .from('profiles')
                    .select('id, username, display_name, avatar_url, header_url, bio, website, location, created_at, twitter_username, instagram_username, discord_username')
                    .ilike('username', searchName)
                    .limit(1);

                if (usernameMatch && usernameMatch.length > 0) {
                    foundUser = usernameMatch[0];
                }

                if (!foundUser) {
                    const { data: displayMatch } = await supabase
                        .from('profiles')
                        .select('id, username, display_name, avatar_url, header_url, bio, website, location, created_at, twitter_username, instagram_username, discord_username')
                        .ilike('display_name', searchName)
                        .limit(1);

                    if (displayMatch && displayMatch.length > 0) {
                        foundUser = displayMatch[0];
                    }
                }

                // 3. Post Author Lookup (Fallback)
                if (!foundUser) {
                    let { data: postData } = await supabase
                        .from('posts')
                        .select('user_id, author_name')
                        .ilike('author_name', searchName)
                        .not('user_id', 'is', null)
                        .limit(1);

                    if (postData && postData.length > 0 && postData[0].user_id) {
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
                    const normalize = (s: string) => s ? s.toLowerCase().trim() : '';
                    if (foundUser.username && normalize(foundUser.username) !== normalize(searchName)) {
                        navigate(`/user/${foundUser.username}`, { replace: true });
                    }
                }
            } catch (err) {
                console.error('[UserProfile] Error looking up user:', err);
            } finally {
                setLookingUp(false);
            }
        };

        lookupUser();
    }, [username, navigate]);

    // Check follow status and get counts
    useEffect(() => {
        const checkFollowStatus = async () => {
            if (!profile?.id) return;

            const { count: followers } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('following_id', profile.id);
            setFollowerCount(followers || 0);

            const { count: following } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('follower_id', profile.id);
            setFollowingCount(following || 0);

            if (user?.id && user.id !== profile.id) {
                if (!isValidUUID(user.id) || !isValidUUID(profile.id)) return;

                const { data } = await supabase
                    .from('follows')
                    .select('follower_id')
                    .eq('follower_id', user.id)
                    .eq('following_id', profile.id)
                    .maybeSingle();

                setIsFollowing(!!data);
            }
        };

        checkFollowStatus();
    }, [profile?.id, user?.id]);

    // Load user data and posts
    useEffect(() => {
        const loadUserData = async () => {
            if (profile?.id) {
                const userStats = await getUserStats(profile.id);
                setStats(userStats);

                const result = await listPostsFromDb({ limit: 200 });
                const filtered = result.posts.filter((p) =>
                    p.user_id === profile.id ||
                    (profile.display_name && p.author_name?.toLowerCase() === profile.display_name?.toLowerCase()) ||
                    (profile.username && p.author_name?.toLowerCase() === profile.username?.toLowerCase())
                );

                const formattedPosts: UserPost[] = filtered.map((p: any) => {
                    const createdDate = p.created_at ? new Date(p.created_at) : null;
                    const formattedDate = createdDate
                        ? createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '';
                    return {
                        slug: p.id,
                        postId: p.id,
                        title: p.title,
                        content: p.content || "",
                        date: formattedDate,
                        rawDate: p.created_at || '',
                        author: profile.username,
                        authorAvatar: profile.avatar_url,
                        authorUsername: profile.username,
                        userId: p.user_id,
                        isPinned: p.is_pinned || false,
                        isHtml: true,
                        viewCount: p.view_count || 0,
                        attachments: p.attachments?.map((a: any) => ({
                            url: a.url || '',
                            type: (String(a.type).toLowerCase() === 'music' ? 'music' : (String(a.type).toLowerCase().startsWith('video') ? 'video' : 'image')) as 'image' | 'video' | 'music'
                        })).filter((a: any) => a.url) || undefined,
                    };
                });
                setUserPosts(formattedPosts);
            }
        };
        loadUserData();
    }, [profile]);

    // Load followers list
    const loadFollowers = async () => {
        if (!user || !profile?.id) return;
        setLoadingList(true);
        try {
            const { data: followData } = await supabase
                .from('follows')
                .select('follower_id')
                .eq('following_id', profile.id);

            if (followData && followData.length > 0) {
                const followerIds = followData.map(f => f.follower_id);
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
        if (!user || !profile?.id) return;
        setLoadingList(true);
        try {
            const { data: followData } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', profile.id);

            if (followData && followData.length > 0) {
                const followingIds = followData.map(f => f.following_id);
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
                const { data: followerProfile } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', user.id)
                    .single();

                await supabase.from("notifications").insert([{
                    user_id: profile.id,
                    type: "follow",
                    content: {
                        follower: followerProfile?.username || "Someone",
                        followerId: user.id,
                        followerUsername: followerProfile?.username
                    },
                    read: false,
                }]);
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

    async function handleLogout() {
        try {
            await logout();
            navigate("/");
        } catch (error) {
            console.error("Logout error:", error);
        }
    }

    // Start DM session
    const handleStartDM = async () => {
        if (!profile?.id) return;
        setStartingDM(true);
        try {
            const sessionId = await startSession(profile.id);
            if (sessionId) {
                setPendingSessionId(sessionId);
            }
        } catch (err) {
            console.error('Error starting session:', err);
        } finally {
            setStartingDM(false);
        }
    };

    // Modal component for followers/following list
    const FollowModal = ({ title, users, onClose }: { title: string; users: FollowUser[]; onClose: () => void; }) => (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-black border border-green-800/50 rounded-lg p-4 max-w-md w-full max-h-[70vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-green-400">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {loadingList ? (
                    <div className="text-center py-4">
                        <div className="inline-block w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-gray-500 text-center py-4">No users yet</div>
                ) : (
                    <div className="space-y-2">
                        {users.map((u) => (
                            <Link
                                key={u.id}
                                to={`/user/${u.username || u.id}`}
                                onClick={onClose}
                                className="flex items-center gap-3 p-2 hover:bg-green-900/20 rounded-lg"
                            >
                                {u.avatar_url ? (
                                    <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-green-700/50" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full border border-green-700/50 bg-green-900/30 flex items-center justify-center">
                                        <span className="text-lg text-green-500">{(u.username || "?")[0]?.toUpperCase()}</span>
                                    </div>
                                )}
                                <div className="text-green-100">@{u.username || "anonymous"}</div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    if (loading || lookingUp) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-red-400 mb-4">Profile not found</p>
                    <Link to="/" className="text-green-400 hover:underline">
                        ← Back to home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-2xl mx-auto px-4 py-4">
                {/* Top Bar */}
                <div className="flex items-center justify-between mb-4">
                    <BackButton />
                    <h1 className="text-lg font-medium text-green-400">
                        {isOwnProfile ? "Profile" : `@${profile.username}`}
                    </h1>
                    <div className="flex items-center gap-2">
                        {isOwnProfile && (
                            <>
                                <Link
                                    to="/profile/edit"
                                    className="p-2 text-green-400 hover:text-green-300"
                                    title="Edit Profile"
                                >
                                    <Edit2 className="w-5 h-5" />
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="p-2 text-gray-500 hover:text-red-400"
                                    title="Logout"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Header Banner - Separate Section */}
                {profile.header_url && (
                    <div className="mb-4 rounded-lg overflow-hidden">
                        <img
                            src={profile.header_url}
                            alt="Header"
                            className="w-full h-36 object-cover"
                        />
                    </div>
                )}

                {/* Profile Info Card */}
                <div className="bg-black/30 border border-green-800/40 rounded-lg p-4 mb-6">
                    {/* Avatar + Info Row */}
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full border-2 border-green-700/50 bg-green-900/30 overflow-hidden flex-shrink-0">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.username || ""} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <span className="text-xl font-medium text-green-400">
                                        {(profile.username || "?")[0]?.toUpperCase()}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-semibold text-green-100">
                                @{profile.username || "anonymous"}
                            </h2>

                            {/* Stats Row - Clickable */}
                            <div className="flex items-center gap-4 text-sm mt-1">
                                <span className="text-gray-500">{stats.posts} posts</span>
                                <button
                                    onClick={() => { loadFollowers(); setShowFollowersModal(true); }}
                                    className="text-gray-500 hover:text-green-400"
                                >
                                    {followerCount} followers
                                </button>
                                <button
                                    onClick={() => { loadFollowing(); setShowFollowingModal(true); }}
                                    className="text-gray-500 hover:text-green-400"
                                >
                                    {followingCount} following
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bio */}
                    {profile.bio && (
                        <p className="text-gray-400 text-sm mt-4 leading-relaxed">{profile.bio}</p>
                    )}

                    {/* Social Links */}
                    {(profile.twitter_username || profile.instagram_username || profile.discord_username) && (
                        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-green-800/40 flex-wrap">
                            {profile.twitter_username && (
                                <a
                                    href={`https://twitter.com/${profile.twitter_username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-gray-500 hover:text-blue-400 text-sm"
                                >
                                    <Twitter className="w-4 h-4" />
                                    <span>@{profile.twitter_username}</span>
                                </a>
                            )}
                            {profile.instagram_username && (
                                <a
                                    href={`https://instagram.com/${profile.instagram_username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-gray-500 hover:text-pink-400 text-sm"
                                >
                                    <Instagram className="w-4 h-4" />
                                    <span>@{profile.instagram_username}</span>
                                </a>
                            )}
                            {profile.discord_username && (
                                <span className="flex items-center gap-1.5 text-gray-500 text-sm" title="Discord">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                    </svg>
                                    <span>{profile.discord_username}</span>
                                </span>
                            )}
                        </div>
                    )}

                    {/* Action Buttons: Follow/Unfollow + Message for others */}
                    {user && !isOwnProfile && (
                        <div className="mt-4 pt-4 border-t border-green-800/40 space-y-2">
                            <div className="flex gap-2">
                                {isFollowing ? (
                                    <button
                                        onClick={handleUnfollow}
                                        disabled={followLoading}
                                        className="flex-1 py-2 px-4 bg-green-900/30 border border-green-700/50 text-green-400 rounded-lg hover:bg-red-900/20 hover:border-red-700/50 hover:text-red-400 disabled:opacity-50 flex items-center justify-center gap-2 group"
                                    >
                                        <Check className="w-4 h-4 group-hover:hidden" />
                                        <UserMinus className="w-4 h-4 hidden group-hover:block" />
                                        <span className="group-hover:hidden">{followLoading ? "..." : "Following"}</span>
                                        <span className="hidden group-hover:inline">{followLoading ? "..." : "Unfollow"}</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleFollow}
                                        disabled={followLoading}
                                        className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-500 text-black font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        {followLoading ? "..." : "Follow"}
                                    </button>
                                )}
                                {/* Message Button */}
                                <button
                                    onClick={handleStartDM}
                                    disabled={startingDM}
                                    className="py-2 px-4 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg hover:bg-gray-700 hover:border-green-500/50 disabled:opacity-50 flex items-center justify-center gap-2"
                                    title="Send Message"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    {startingDM ? "..." : "Message"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* User's Posts - Full PostCard Layout */}
                <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-4">
                        {isOwnProfile ? "Your Posts" : "Posts"}
                    </h3>

                    {userPosts.length === 0 ? (
                        <div className="text-center py-8 bg-black/20 rounded-lg">
                            <p className="text-gray-500 text-sm">No posts yet</p>
                        </div>
                    ) : (
                        <div className="bg-black/20 rounded-lg">
                            {userPosts.map((post) => (
                                <PostCard
                                    key={post.slug}
                                    post={post}
                                    fullContent={true}
                                    showComments={false}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {user && showFollowersModal && (
                <FollowModal title="Followers" users={followersList} onClose={() => setShowFollowersModal(false)} />
            )}
            {user && showFollowingModal && (
                <FollowModal title="Following" users={followingList} onClose={() => setShowFollowingModal(false)} />
            )}

            {/* Messaging Panel - opens when session is started */}
            {pendingSessionId && (
                <MessagingPanel
                    initialSessionId={pendingSessionId}
                    onSessionOpened={() => setPendingSessionId(null)}
                />
            )}
        </div>
    );
}
