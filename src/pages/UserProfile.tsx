import { useParams, Link } from "react-router-dom";
import { useProfile, getUserStats } from "@/hooks/useProfile";
import { useEffect, useState } from "react";
import BackButton from "@/components/BackButton";
import { listPostsFromDb } from "@/data/posts";

export default function UserProfile() {
    const { username } = useParams<{ username: string }>();
    const [userId, setUserId] = useState<string | undefined>();
    const { profile, loading } = useProfile(userId);
    const [stats, setStats] = useState({ posts: 0, comments: 0 });
    const [userPosts, setUserPosts] = useState<any[]>([]);

    useEffect(() => {
        // In a real app, you'd look up user ID by username
        // For now, we'll use the current user's ID
        const loadUser = async () => {
            if (profile?.id) {
                const userStats = await getUserStats(profile.id);
                setStats(userStats);

                // Load user's posts
                const posts = await listPostsFromDb();
                const filtered = posts.filter((p) => p.user_id === profile.id);
                setUserPosts(filtered);
            }
        };
        loadUser();
    }, [profile]);

    if (loading) {
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
                        {/* ASCII Avatar */}
                        <div className="ascii-box p-4 bg-secondary/20">
                            {profile.ascii_avatar ? (
                                <pre className="ascii-text text-xs">{profile.ascii_avatar}</pre>
                            ) : (
                                <pre className="ascii-dim text-xs">
                                    {`  ___
 /   \\
|  o  |
 \\___/
  | |
 /   \\`}
                                </pre>
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
        </div>
    );
}
