import { useParams, Link } from "react-router-dom";
import { useProfile, getUserStats } from "@/hooks/useProfile";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { listPostsFromDb } from "@/data/posts";
import { supabase } from "@/lib/supabase";
import { UserPlus, UserMinus, Twitter, Instagram } from "lucide-react";

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

    // Look up user ID by username
    useEffect(() => {
        const lookupUser = async () => {
            if (!username) {
                setLookingUp(false);
                return;
            }

            console.log('[UserProfile] Looking up user:', username);

            try {
                // First try exact match on username
                // Use limit(1) instead of maybeSingle/single to avoid 406 errors
                let { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, display_name')
                    .ilike('username', username)
                    .limit(1);

                let foundUser = data && data.length > 0 ? data[0] : null;

                // If not found, try matching with potential trailing whitespace (common data issue)
                if (!foundUser) {
                    const { data: looseData } = await supabase
                        .from('profiles')
                        .select('id, username, display_name')
                        .ilike('username', `${username}%`) // Match "TESTER " when searching "TESTER"
                        .limit(5); // Get a few to check

                    if (looseData && looseData.length > 0) {
                        // Find specifically the one that matches when trimmed
                        foundUser = looseData.find(u => u.username?.trim().toLowerCase() === username.toLowerCase()) || looseData[0];
                    }
                }

                // If still not found, try display_name
                if (!foundUser) {
                    const result = await supabase
                        .from('profiles')
                        .select('id, username, display_name')
                        .ilike('display_name', username)
                        .limit(1);

                    if (result.data && result.data.length > 0) {
                        foundUser = result.data[0];
                    }

                    // Try loose display_name if exact failed
                    if (!foundUser) {
                        const { data: looseData } = await supabase
                            .from('profiles')
                            .select('id, username, display_name')
                            .ilike('display_name', `${username}%`)
                            .limit(5);

                        if (looseData && looseData.length > 0) {
                            foundUser = looseData.find(u => u.display_name?.trim().toLowerCase() === username.toLowerCase()) || looseData[0];
                        }
                    }
                }

                if (foundUser) {
                    setUserId(foundUser.id);
                } else {
                    console.log('[UserProfile] User not found');
                }
            } catch (err) {
                console.log('[UserProfile] Error looking up user:', err);
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

                // Load user's posts
                const posts = await listPostsFromDb();
                const filtered = posts.filter((p) => p.user_id === profile.id);
                setUserPosts(filtered);
            }
        };
        loadUserData();
    }, [profile]);

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
                        .select('username, display_name')
                        .eq('id', user.id)
                        .single();

                    const followerName = followerProfile?.display_name || followerProfile?.username || "Someone";

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
                <div className="w-full max-w-4xl mx-auto">
                    <BackButton />
                    <div className="ascii-box p-8 text-center mt-4">
                        <div className="text-red-400 mb-2">Profile not found</div>
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

                {/* Profile Header */}
                <div className="ascii-box p-6">
                    <pre className="ascii-highlight text-xl mb-4">
                        {`╔═══════════════════════════════════════════════════════════════╗
║                       USER PROFILE                            ║
╚═══════════════════════════════════════════════════════════════╝`}
                    </pre>

                    <div className="flex items-start gap-6">
                        {/* Profile Avatar */}
                        <div className="flex-shrink-0">
                            {profile.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt={profile.username || "User"}
                                    className="w-24 h-24 rounded-lg border-2 border-green-700 object-cover"
                                />
                            ) : (
                                <div className="w-24 h-24 rounded-lg border-2 border-green-700 bg-secondary/20 flex items-center justify-center">
                                    <span className="text-4xl text-green-500">
                                        {(profile.username || "?")[0]?.toUpperCase()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Profile Info */}
                        <div className="flex-1">
                            <div className="ascii-highlight text-2xl mb-2">
                                @{profile.username || "anonymous"}
                            </div>

                            {profile.bio && (
                                <div className="ascii-text mb-4">{profile.bio}</div>
                            )}

                            {/* Social Media Links */}
                            {(profile.twitter_username || profile.instagram_username) && (
                                <div className="flex gap-4 mb-4">
                                    {profile.twitter_username && (
                                        <a
                                            href={`https://x.com/${profile.twitter_username}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                                            title={`@${profile.twitter_username} on X/Twitter`}
                                        >
                                            <Twitter className="w-5 h-5" />
                                            <span className="text-sm">@{profile.twitter_username}</span>
                                        </a>
                                    )}
                                    {profile.instagram_username && (
                                        <a
                                            href={`https://instagram.com/${profile.instagram_username}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-pink-400 hover:text-pink-300 transition-colors"
                                            title={`@${profile.instagram_username} on Instagram`}
                                        >
                                            <Instagram className="w-5 h-5" />
                                            <span className="text-sm">@{profile.instagram_username}</span>
                                        </a>
                                    )}
                                </div>
                            )}

                            <div className="ascii-dim text-sm space-y-1">
                                {profile.location && <div>📍 {profile.location}</div>}
                                {profile.website && (
                                    <div>
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

                            {/* Stats */}
                            <div className="flex gap-6 mt-4 pt-4 border-t border-ascii-border">
                                <div>
                                    <div className="ascii-highlight text-xl">{stats.posts}</div>
                                    <div className="ascii-dim text-xs">Posts</div>
                                </div>
                                <div>
                                    <div className="ascii-highlight text-xl">{stats.comments}</div>
                                    <div className="ascii-dim text-xs">Comments</div>
                                </div>
                                <div>
                                    <div className="ascii-highlight text-xl">{followerCount}</div>
                                    <div className="ascii-dim text-xs">Followers</div>
                                </div>
                                <div>
                                    <div className="ascii-highlight text-xl">{followingCount}</div>
                                    <div className="ascii-dim text-xs">Following</div>
                                </div>
                            </div>

                            {/* Follow Button */}
                            {user && user.id !== profile.id && (
                                <div className="mt-4">
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
        </div>
    );
}
