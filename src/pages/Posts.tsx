import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import { listPostsFromDb } from "@/data/posts";
import { slugify } from "@/lib/markdown";
import { useLocation, useNavigate, Link } from "react-router-dom";
import PostCard, { BatchPollData } from "@/components/PostCard";
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
  is_deleted?: boolean;
  author_role?: string;
};

const FILES = ["post1.md", "post2.md"];

const PAGE_SIZE = 10;

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [currentUserIsAdmin, setCurrentUserIsAdmin] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const qParam = params.get("q") || "";
  const [query, setQuery] = useState(qParam);
  const { toast } = useToast();

  // Batch poll data
  const [pollsMap, setPollsMap] = useState<Map<string, BatchPollData>>(new Map());

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
    try {
      // If user is admin, they might be doing a hard delete or soft delete
      // But the requirement says "make the users can delete thier posts"
      // So deletePost in the hook now defaults to soft delete.

      const { deletePost: apiDeletePost } = await import("@/hooks/useSupabasePosts");
      await apiDeletePost(postId);

      setPosts(prev => prev.map(p => 
        p.postId === postId ? { ...p, is_deleted: true } : p
      ));

      toast({
        title: "Post deleted",
        description: "The post has been removed"
      });
    } catch (error) {
      console.error("[Posts] Error deleting post:", error);
      toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
    }
  };

  // Fetch one page of posts and enrich them (profiles for authors + polls).
  // Returns the mapped Post[] for the page so callers can append/replace.
  const fetchPage = async (pageCursor: string | null): Promise<{ posts: Post[]; nextCursor: string | null; hasMore: boolean }> => {
    const showDrafts = import.meta.env.VITE_SHOW_DRAFTS === "true";
    // Filters (hidden, is_deleted, draft, thread-replies) happen at the DB —
    // each page returns exactly PAGE_SIZE visible posts and pagination cannot dead-end.
    const result = await listPostsFromDb({
      limit: PAGE_SIZE,
      cursor: pageCursor || undefined,
      includeDrafts: showDrafts,
    });
    const rawPosts = result.posts || [];

    if (rawPosts.length === 0) {
      return { posts: [], nextCursor: result.nextCursor, hasMore: result.hasMore };
    }

    // Collect author user_ids on this page, fetch only those profiles
    const userIds = [...new Set(rawPosts.map((p: any) => p.user_id).filter(Boolean))] as string[];
    const postIds = rawPosts.map((p: any) => p.id).filter(Boolean) as string[];

    const [profilesResult, pollsResult] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id, role, avatar_url, username, last_seen, discord_id, spotify_status').in('id', userIds)
        : Promise.resolve({ data: null, error: null }),
      postIds.length > 0
        ? supabase.from('post_polls')
            .select('*, options:post_poll_options(*), votes:post_poll_votes(*)')
            .in('post_id', postIds)
            .then(res => res)
            .catch(err => ({ data: null, error: err }))
        : Promise.resolve({ data: null, error: null }),
    ]);

    const adminUserIds = new Set<string>();
    const userAvatars = new Map<string, string>();
    const userUsernames = new Map<string, string>();
    const userRoles = new Map<string, string>();
    const userDiscordIds = new Map<string, string>();
    const userSpotifyStatus = new Map<string, any>();

    if (profilesResult.data) {
      profilesResult.data.forEach((p: any) => {
        if (p.role === 'admin' || p.role === 'ceo') adminUserIds.add(p.id);
        if (p.avatar_url) userAvatars.set(p.id, p.avatar_url);
        if (p.username) userUsernames.set(p.id, p.username);
        if (p.role) userRoles.set(p.id, p.role);
        if (p.discord_id) userDiscordIds.set(p.id, p.discord_id);
        if (p.spotify_status) userSpotifyStatus.set(p.id, p.spotify_status);
      });
    }

    if (pollsResult.error) {
      console.warn('[Posts] Poll fetch error:', pollsResult.error);
    } else if (pollsResult.data && pollsResult.data.length > 0) {
      setPollsMap(prev => {
        const updated = new Map(prev);
        (pollsResult.data as any[]).forEach((poll: any) => {
          updated.set(poll.post_id, {
            id: poll.id,
            question: poll.question,
            post_id: poll.post_id,
            options: poll.options || [],
            votes: poll.votes || [],
          });
        });
        return updated;
      });
    }

    const mapped: Post[] = rawPosts.map((p: any) => {
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
          guestId: p.guest_id || undefined,
          anonymousId: p.anonymous_id || undefined,
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
          is_deleted: p.is_deleted || false,
          is_registered_only: p.is_registered_only || false,
          author_role: p.user_id ? userRoles.get(p.user_id) : undefined,
          authorDiscordId: p.user_id ? userDiscordIds.get(p.user_id) : undefined,
          authorSpotifyStatus: p.user_id ? userSpotifyStatus.get(p.user_id) : undefined,
        } as Post;
      });

    return { posts: mapped, nextCursor: result.nextCursor, hasMore: result.hasMore };
  };

  // Initial load: first page only
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const page = await fetchPage(null);
        setPosts(page.posts);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch (error) {
        console.error("[Posts] Error loading posts:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      // Dedupe by postId in case cursor overlap occurs
      setPosts(prev => {
        const seen = new Set(prev.map(p => p.postId));
        return [...prev, ...page.posts.filter(p => !seen.has(p.postId))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error("[Posts] Error loading more posts:", error);
      toast({ title: "Error", description: "Failed to load more posts", variant: "destructive" });
    } finally {
      setIsLoadingMore(false);
    }
  };

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
    const result = posts.filter((p) => {
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
            {filtered.map((post) => (
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
                batchPoll={pollsMap.get(post.postId) || null}
              />
            ))}

            {/* Load More from DB */}
            {hasMore && !query && (
              <div className="text-center py-6 border-t border-green-800/40">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="text-green-400 hover:text-green-300 text-sm disabled:opacity-50"
                >
                  {isLoadingMore ? "Loading..." : `Show more (${PAGE_SIZE} posts)`}
                </button>
              </div>
            )}

            {/* When searching, hint user to load more if no/few matches */}
            {hasMore && query && (
              <div className="text-center py-4 border-t border-green-800/40 space-y-2">
                <p className="text-gray-500 text-xs">
                  Searching {posts.length} loaded posts. More exist on the server.
                </p>
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="text-green-400 hover:text-green-300 text-sm disabled:opacity-50"
                >
                  {isLoadingMore ? "Loading..." : `Load ${PAGE_SIZE} more to expand search`}
                </button>
              </div>
            )}

            {!hasMore && posts.length > 0 && (
              <div className="text-center py-4 text-gray-500 text-xs">
                Showing all {posts.length} posts
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
