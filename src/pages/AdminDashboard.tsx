import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Shield, Users, FileText, Music, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, UserX } from "lucide-react";
import MusicManager from "@/components/admin/MusicManager";
import UserManagement from "@/components/admin/UserManagement";
import GuestManagement from "@/components/admin/GuestManagement";

const POSTS_PER_PAGE = 20;

export default function AdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ posts: 0, users: 0, comments: 0, guests: 0 });
    const [users, setUsers] = useState<any[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPosts, setTotalPosts] = useState(0);

    const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);

    useEffect(() => {
        const checkAdmin = async () => {
            // Must be logged in
            if (!user) {
                navigate('/login');
                return;
            }

            // Check if user has admin role in database
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (error || profile?.role !== 'admin') {
                toast({
                    title: "Access Denied",
                    description: "You don't have admin privileges",
                    variant: "destructive"
                });
                navigate('/');
                return;
            }

            setIsAdmin(true);
            setLoading(false);
            loadStats();
        };

        checkAdmin();
    }, [user, navigate, toast]);

    useEffect(() => {
        loadPosts();
    }, [currentPage]);

    const loadStats = async () => {
        try {
            const { count: postsCount } = await supabase.from("posts").select("*", { count: "exact", head: true });
            const { count: usersCount } = await supabase.from("profiles").select("*", { count: "exact", head: true });
            const { count: commentsCount } = await supabase.from("comments").select("*", { count: "exact", head: true });
            const { count: guestsCount } = await supabase.from("guests").select("*", { count: "exact", head: true });

            setStats({
                posts: postsCount || 0,
                users: usersCount || 0,
                comments: commentsCount || 0,
                guests: guestsCount || 0
            });
            setTotalPosts(postsCount || 0);

            // Try to use database function for emails, fallback to profiles only
            let usersData = null;
            const { data: rpcData, error: rpcError } = await supabase.rpc('get_users_with_emails');
            console.log('RPC result:', { rpcData, rpcError });
            if (rpcError) {
                console.log('Falling back to profiles table');
                // Fallback to profiles table if function doesn't exist
                const { data: profilesData } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50);
                usersData = profilesData;
            } else {
                usersData = rpcData;
            }
            if (usersData) setUsers(usersData);

            loadPosts();
        } catch (error) {
            console.error('Error loading stats:', error);
            // Continue with empty data - don't crash
        }
    };

    const loadPosts = async () => {
        const from = (currentPage - 1) * POSTS_PER_PAGE;
        const to = from + POSTS_PER_PAGE - 1;

        const { data: postsData } = await supabase
            .from("posts")
            .select("*")
            .order("created_at", { ascending: false })
            .range(from, to);

        if (postsData) setPosts(postsData);
    };

    const handleDeletePost = async (id: string) => {
        if (!confirm("Are you sure you want to delete this post?")) return;

        const { error } = await supabase.from("posts").delete().eq("id", id);
        if (error) {
            toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
        } else {
            toast({ title: "Success", description: "Post deleted" });
            loadStats();
        }
    };

    const handleToggleHidden = async (id: string, currentHidden: boolean) => {
        const { error } = await supabase
            .from("posts")
            .update({ hidden: !currentHidden })
            .eq("id", id);

        if (error) {
            toast({ title: "Error", description: "Failed to update post visibility", variant: "destructive" });
        } else {
            toast({ title: "Success", description: currentHidden ? "Post is now visible" : "Post is now hidden" });
            loadPosts();
        }
    };

    const handleHideAll = async () => {
        if (!confirm("Are you sure you want to hide ALL posts? This will hide all visible posts.")) return;

        const { error } = await supabase
            .from("posts")
            .update({ hidden: true })
            .eq("hidden", false);

        if (error) {
            toast({ title: "Error", description: "Failed to hide all posts", variant: "destructive" });
        } else {
            toast({ title: "Success", description: "All posts are now hidden" });
            loadPosts();
        }
    };

    const handleShowAll = async () => {
        if (!confirm("Are you sure you want to show ALL posts? This will make all hidden posts visible.")) return;

        const { error } = await supabase
            .from("posts")
            .update({ hidden: false })
            .eq("hidden", true);

        if (error) {
            toast({ title: "Error", description: "Failed to show all posts", variant: "destructive" });
        } else {
            toast({ title: "Success", description: "All posts are now visible" });
            loadPosts();
        }
    };

    if (loading) return <div className="p-8 text-center ascii-dim">Loading Matrix...</div>;

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <BackButton />
                    <h1 className="ascii-highlight text-xl flex items-center gap-2">
                        <Shield className="w-5 h-5" /> ADMIN CONSOLE
                    </h1>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="ascii-box p-4">
                        <div className="ascii-dim text-xs mb-1">TOTAL USERS</div>
                        <div className="text-2xl ascii-highlight">{stats.users}</div>
                    </div>
                    <div className="ascii-box p-4">
                        <div className="ascii-dim text-xs mb-1">GUESTS</div>
                        <div className="text-2xl text-purple-400">{stats.guests}</div>
                    </div>
                    <div className="ascii-box p-4">
                        <div className="ascii-dim text-xs mb-1">TOTAL POSTS</div>
                        <div className="text-2xl ascii-highlight">{stats.posts}</div>
                    </div>
                    <div className="ascii-box p-4">
                        <div className="ascii-dim text-xs mb-1">TOTAL COMMENTS</div>
                        <div className="text-2xl ascii-highlight">{stats.comments}</div>
                    </div>
                </div>

                <Tabs defaultValue="posts" className="w-full">
                    <TabsList className="ascii-box p-1 bg-transparent w-full justify-start">
                        <TabsTrigger value="posts" className="data-[state=active]:bg-ascii-highlight data-[state=active]:text-black ascii-text">
                            <FileText className="w-4 h-4 mr-2" /> Posts
                        </TabsTrigger>
                        <TabsTrigger value="users" className="data-[state=active]:bg-ascii-highlight data-[state=active]:text-black ascii-text">
                            <Users className="w-4 h-4 mr-2" /> Users
                        </TabsTrigger>
                        <TabsTrigger value="permissions" className="data-[state=active]:bg-ascii-highlight data-[state=active]:text-black ascii-text">
                            <Shield className="w-4 h-4 mr-2" /> Permissions
                        </TabsTrigger>
                        <TabsTrigger value="guests" className="data-[state=active]:bg-ascii-highlight data-[state=active]:text-black ascii-text">
                            <UserX className="w-4 h-4 mr-2" /> Guests
                        </TabsTrigger>
                        <TabsTrigger value="music" className="data-[state=active]:bg-ascii-highlight data-[state=active]:text-black ascii-text">
                            <Music className="w-4 h-4 mr-2" /> Music
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="posts" className="mt-4">
                        <div className="ascii-box p-4 overflow-x-auto">
                            {/* Bulk Actions */}
                            <div className="flex gap-2 mb-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleHideAll}
                                    className="ascii-box text-yellow-400 hover:bg-yellow-900/20"
                                >
                                    <EyeOff className="w-4 h-4 mr-2" /> Hide All
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleShowAll}
                                    className="ascii-box text-green-400 hover:bg-green-900/20"
                                >
                                    <Eye className="w-4 h-4 mr-2" /> Show All
                                </Button>
                            </div>

                            <table className="w-full text-sm text-left">
                                <thead className="ascii-dim border-b border-ascii-border">
                                    <tr>
                                        <th className="p-2">Title</th>
                                        <th className="p-2">Author</th>
                                        <th className="p-2">Date</th>
                                        <th className="p-2">Status</th>
                                        <th className="p-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {posts.map((post) => (
                                        <tr key={post.id} className="border-b border-ascii-border/50 hover:bg-white/5">
                                            <td className="p-2 font-mono">{post.title}</td>
                                            <td className="p-2">{post.author_name}</td>
                                            <td className="p-2">{new Date(post.created_at).toLocaleDateString()}</td>
                                            <td className="p-2">
                                                {post.hidden ? (
                                                    <span className="text-yellow-400 text-xs">Hidden</span>
                                                ) : (
                                                    <span className="text-green-400 text-xs">Visible</span>
                                                )}
                                            </td>
                                            <td className="p-2 flex gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleToggleHidden(post.id, post.hidden || false)}
                                                    className={post.hidden ? "text-green-400 hover:text-green-300" : "text-yellow-400 hover:text-yellow-300"}
                                                    title={post.hidden ? "Show post" : "Hide post"}
                                                >
                                                    {post.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeletePost(post.id)}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Pagination Controls */}
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-ascii-border">
                                <div className="ascii-dim text-xs">
                                    Page {currentPage} of {totalPages} ({totalPosts} posts)
                                </div>
                                <div className="flex gap-1">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="ascii-box"
                                    >
                                        <ChevronsLeft className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="ascii-box"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <span className="ascii-box px-3 py-1 text-sm">{currentPage}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="ascii-box"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="ascii-box"
                                    >
                                        <ChevronsRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="users" className="mt-4">
                        <div className="ascii-box p-4 overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="ascii-dim border-b border-ascii-border">
                                    <tr>
                                        <th className="p-2">Username</th>
                                        <th className="p-2">Email</th>
                                        <th className="p-2">Phone</th>
                                        <th className="p-2">Joined</th>
                                        <th className="p-2">ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="border-b border-ascii-border/50 hover:bg-white/5">
                                            <td className="p-2 font-mono">{u.username || 'N/A'}</td>
                                            <td className="p-2">{u.email || 'N/A'}</td>
                                            <td className="p-2">{u.phone || 'N/A'}</td>
                                            <td className="p-2">{new Date(u.created_at).toLocaleDateString()}</td>
                                            <td className="p-2 ascii-dim text-xs">{u.id}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    <TabsContent value="permissions" className="mt-4">
                        <UserManagement />
                    </TabsContent>

                    <TabsContent value="guests" className="mt-4">
                        <GuestManagement />
                    </TabsContent>

                    <TabsContent value="music" className="mt-4">
                        <MusicManager />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

