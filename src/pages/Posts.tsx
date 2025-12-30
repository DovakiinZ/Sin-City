import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import { listPostsFromDb } from "@/data/posts";
import { slugify } from "@/lib/markdown";
import { useLocation, useNavigate, Link } from "react-router-dom";
import PostCard from "@/components/PostCard";
import { supabase } from "@/lib/supabase";
import { Search, Terminal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminPostTerminal from "@/components/admin/AdminPostTerminal";

type Post = {
  title: string;
  date: string;
  rawDate: string;
  content: string;
  slug: string;
  postId: string;
  author?: string;
  authorAvatar?: string;
  authorUsername?: string;
  userId?: string;
  guestId?: string;  // For anonymous posts
  anonymousId?: string;  // Human-readable ANON-XXXX for admin
  isAdmin?: boolean;
  draft?: boolean;
  viewCount?: number;
  isPinned?: boolean;
  isHtml?: boolean;
  attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
  gif_url?: string;
  hidden?: boolean;
};

const FILES = ["post1.md", "post2.md"];

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [visibleCount, setVisibleCount] = useState(10);
  const [currentUserIsAdmin, setCurrentUserIsAdmin] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const qParam = params.get("q") || "";
  const [query, setQuery] = useState(qParam);
  const { toast } = useToast();

  // Admin terminal state
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedPostForTerminal, setSelectedPostForTerminal] = useState<Post | null>(null);

  const togglePin = async (postId: string, currentlyPinned: boolean) => {
    if (!currentUserIsAdmin) return;
    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_pinned: !currentlyPinned })
        .eq('id', postId);

      if (error) throw error;

      setPosts(prev => prev.map(p =>
        p.postId === postId ? { ...p, isPinned: !currentlyPinned } : p
      ).sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return a.date < b.date ? 1 : -1;
      }));
    } catch (error) {
      console.error("[Posts] Error toggling pin:", error);
    }
  };

  const hidePost = async (postId: string) => {
    if (!currentUserIsAdmin) return;
    try {
      const post = posts.find(p => p.postId === postId);
      const newHidden = !post?.hidden;

      const { error } = await supabase
        .from('posts')
        .update({ hidden: newHidden })
        .eq('id', postId);

      if (error) throw error;

      setPosts(prev => prev.map(p =>
        p.postId === postId ? { ...p, hidden: newHidden } : p
      ));

      toast({
        title: newHidden ? "Post hidden" : "Post visible",
        description: newHidden ? "Post is now hidden from public view" : "Post is now visible to everyone"
      });
    } catch (error) {
      console.error("[Posts] Error hiding post:", error);
      toast({ title: "Error", description: "Failed to update post visibility", variant: "destructive" });
    }
  };

  const deletePost = async (postId: string) => {
    if (!currentUserIsAdmin) return;
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      setPosts(prev => prev.filter(p => p.postId !== postId));

      toast({
        title: "Post deleted",
        description: "The post has been permanently removed"
      });
    } catch (error) {
      console.error("[Posts] Error deleting post:", error);
      toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
    }
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);

      let adminUserIds: Set<string> = new Set();
      let userAvatars: Map<string, string> = new Map();
      let userUsernames: Map<string, string> = new Map();

      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, role, avatar_url, username');
        if (profiles) {
          profiles.forEach(p => {
            if (p.role === 'admin') adminUserIds.add(p.id);
            if (p.avatar_url) userAvatars.set(p.id, p.avatar_url);
            if (p.username) userUsernames.set(p.id, p.username);
          });
          // Note: Current user check moved to separate useEffect
        }
      } catch (error) {
        console.error("[Posts] Error fetching profiles:", error);
      }

      let allPosts: Post[] = [];
      try {
        const result = await listPostsFromDb({ limit: 200 }); // Get more posts for the Posts page
        allPosts = (result.posts || []).map((p: any) => {
          const createdDate = p.created_at ? new Date(p.created_at) : null;
          const formattedDate = createdDate
            ? createdDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
            : '';
          return {
            title: p.title,
            date: formattedDate,
            rawDate: p.created_at || '',
            content: p.content || "",
            slug: p.slug || p.id || slugify(p.title),
            postId: p.id,
            author: p.user_id ? userUsernames.get(p.user_id) || p.author_name : p.author_name || undefined,
            authorAvatar: p.author_avatar || (p.user_id ? userAvatars.get(p.user_id) : undefined) || undefined,
            authorUsername: p.user_id ? userUsernames.get(p.user_id) : undefined,
            userId: p.user_id || undefined,
            guestId: p.guest_id || undefined,  // For anonymous tracking
            anonymousId: p.anonymous_id || undefined,  // ANON-XXXX for admin view
            isAdmin: p.user_id ? adminUserIds.has(p.user_id) : false,
            draft: p.draft || false,
            viewCount: p.view_count || 0,
            isPinned: p.is_pinned || false,
            isHtml: true,
            attachments: p.attachments?.map((a: any) => ({
              url: a.url || '',
              type: (String(a.type).toLowerCase() === 'music' ? 'music' : (String(a.type).toLowerCase().startsWith('video') ? 'video' : 'image')) as 'image' | 'video' | 'music'
            })).filter((a: any) => a.url) || undefined,
            gif_url: p.gif_url || undefined,
          };
        });
      } catch (error) {
        console.error("[Posts] Error loading posts:", error);
      }

      const showDrafts = import.meta.env.VITE_SHOW_DRAFTS === "true";
      const filtered = allPosts.filter((p) => (showDrafts ? true : !p.draft));
      filtered.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return a.date < b.date ? 1 : -1;
      });
      setPosts(filtered);
      setIsLoading(false);
    })();
  }, []);

  // Separate effect to check admin status when user loads
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setCurrentUserIsAdmin(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data?.role === 'admin') {
        setCurrentUserIsAdmin(true);
      }
    };

    checkAdmin();
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = posts.filter((p) => {
      const qOk = q
        ? [p.title, p.author, p.content]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(q))
        : true;
      return qOk;
    });

    switch (sortBy) {
      case "recent":
        result.sort((a, b) => (a.rawDate < b.rawDate ? 1 : -1));
        break;
      case "oldest":
        result.sort((a, b) => (a.rawDate > b.rawDate ? 1 : -1));
        break;
      case "title":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    // Pinned first
    return result.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }, [posts, query, sortBy]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <BackButton />
            <h1 className="text-xl font-semibold text-green-400">All Posts</h1>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                const p = new URLSearchParams(location.search);
                if (e.target.value) p.set("q", e.target.value);
                else p.delete("q");
                navigate({ pathname: location.pathname, search: p.toString() }, { replace: true });
              }}
              placeholder="Search posts..."
              className="w-full bg-black/30 border border-green-800/50 rounded-lg pl-10 pr-4 py-2 text-sm text-green-100 placeholder-gray-500 focus:border-green-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            {(["recent", "oldest", "title"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={cn(
                  "px-3 py-1 text-xs rounded transition-colors",
                  sortBy === option
                    ? "bg-green-600 text-black"
                    : "text-gray-500 hover:text-green-400"
                )}
              >
                {option === "recent" ? "Recent" : option === "oldest" ? "Oldest" : "A-Z"}
              </button>
            ))}
          </div>
        </div>

        {/* Posts List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm mt-3">Loading posts...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {posts.length === 0
              ? "No published posts yet."
              : "No posts match your search."}
          </div>
        ) : (
          <div>
            {filtered.slice(0, visibleCount).map((post) => (
              <PostCard
                key={post.slug}
                post={post}
                fullContent={true}
                showComments={true}
                isAdmin={currentUserIsAdmin}
                isHidden={post.hidden || false}
                onTogglePin={togglePin}
                onHide={hidePost}
                onDelete={deletePost}
              />
            ))}

            {/* Load More */}
            {filtered.length > visibleCount && (
              <div className="text-center py-6 border-t border-green-800/40">
                <button
                  onClick={() => setVisibleCount(prev => prev + 10)}
                  className="text-green-400 hover:text-green-300 text-sm"
                >
                  Show more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}

            {filtered.length > 0 && visibleCount >= filtered.length && (
              <div className="text-center py-4 text-gray-500 text-xs">
                Showing all {filtered.length} posts
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Terminal FAB - Mobile Friendly */}
      {currentUserIsAdmin && !showTerminal && (
        <button
          onClick={() => setShowTerminal(true)}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 bg-green-600 hover:bg-green-500 text-black rounded-full shadow-lg shadow-green-500/20 flex items-center justify-center transition-all hover:scale-110"
          title="Open Admin Terminal"
        >
          <Terminal className="w-5 h-5" />
        </button>
      )}

      {/* Admin Terminal */}
      {showTerminal && (
        <AdminPostTerminal
          postId="global"
          onClose={() => setShowTerminal(false)}
        />
      )}
    </div>
  );
}
