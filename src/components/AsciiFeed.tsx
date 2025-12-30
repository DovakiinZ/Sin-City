import { useEffect, useState, useMemo } from "react";
import matter from "gray-matter";
import { Link, useNavigate } from "react-router-dom";
import AsciiNewPostForm, { NewPost } from "./MinimalPostForm";
import UserPanel from "./UserPanel";
import { useAuth } from "@/context/AuthContext";
import { createPost } from "@/hooks/useSupabasePosts";
import { listPostsFromDb } from "@/data/posts";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import PostCard from "@/components/PostCard";
import { Plus, SlidersHorizontal } from "lucide-react";

type Post = {
  title: string;
  date: string;
  rawDate?: string;
  content: string;
  slug: string;
  postId?: string;
  author?: string;
  authorAvatar?: string;
  authorUsername?: string;
  authorLastSeen?: string;
  userId?: string;  // For detecting anonymous posts
  guestId?: string;  // For anonymous posts with tracking
  anonymousId?: string;  // ANON-XXXX for admin display
  textAlign?: 'right' | 'center' | 'left';  // Text alignment
  isPinned?: boolean;
  isHtml?: boolean;
  attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
  gif_url?: string;
  music_metadata?: any; // Cached music metadata for fallback
};

interface FrontMatterData {
  title?: unknown;
  date?: unknown;
  author?: unknown;
}

const FILES = ["post1.md", "post2.md"]; // served from /public/posts

// Helper to map database post to UI Post type
const mapDbPostToPost = (
  p: any,
  userUsernames: Map<string, string>,
  userAvatars: Map<string, string>,
  userLastSeens: Map<string, string>
): Post => {
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
    slug: p.slug || p.id || p.title,
    postId: p.id,
    author: p.user_id ? userUsernames.get(p.user_id) || p.author_name : p.author_name || undefined,
    authorAvatar: p.author_avatar || (p.user_id ? userAvatars.get(p.user_id) : undefined) || undefined,
    authorUsername: p.user_id ? userUsernames.get(p.user_id) : undefined,
    authorLastSeen: p.user_id ? userLastSeens.get(p.user_id) : undefined,
    userId: p.user_id || undefined,  // For detecting anonymous posts
    guestId: p.guest_id || undefined,  // For anonymous tracking
    anonymousId: p.anonymous_id || undefined,  // ANON-XXXX for admin
    textAlign: p.text_align || 'right',  // Text alignment
    isHtml: true,
    isPinned: p.is_pinned || false,
    attachments: p.attachments?.map((a: any) => ({
      url: a.url || '',
      type: (String(a.type).toLowerCase() === 'music' ? 'music' : (String(a.type).toLowerCase().startsWith('video') ? 'video' : 'image')) as 'image' | 'video' | 'music'
    })).filter((a: any) => a.url) || undefined,
    gif_url: p.gif_url || undefined,
    music_metadata: p.music_metadata || undefined,
  };
};

const AsciiFeed = () => {
  const navigate = useNavigate();
  const [markdownPosts, setMarkdownPosts] = useState<Post[]>([]);
  const [dbPosts, setDbPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Load posts from database using listPostsFromDb (same as Posts.tsx for consistency)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Fetch profiles for avatars and usernames
        let userAvatars: Map<string, string> = new Map();
        let userUsernames: Map<string, string> = new Map();
        let userLastSeens: Map<string, string> = new Map();

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url, username, last_seen, role');

        if (profiles) {
          profiles.forEach(p => {
            if (p.avatar_url) userAvatars.set(p.id, p.avatar_url);
            if (p.username) userUsernames.set(p.id, p.username);
            if (p.last_seen) userLastSeens.set(p.id, p.last_seen);
          });
          // Check if current user is admin
          if (user?.id) {
            const currentProfile = profiles.find(p => p.id === user.id);
            if (currentProfile && (currentProfile as any).role === 'admin') {
              setIsAdmin(true);
            }
          }
        }

        // Use listPostsFromDb with cursor pagination - load more posts initially
        const result = await listPostsFromDb({ limit: 50 });
        const mapped: Post[] = (result.posts || [])
          .filter((p: any) => !p.hidden)
          .map((p: any) => mapDbPostToPost(p, userUsernames, userAvatars, userLastSeens));
        setDbPosts(mapped);
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error("[AsciiFeed] Error loading posts:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load markdown posts
  useEffect(() => {
    (async () => {
      const loaded = await Promise.all(
        FILES.map(async (file) => {
          const res = await fetch(`/posts/${file}`);
          const text = await res.text();
          const { data, content } = matter(text);
          const frontmatter = data as FrontMatterData;
          return {
            title: String(frontmatter.title || file),
            date: String(frontmatter.date || ""),
            content,
            slug: file.replace(/\.md$/, ""),
            author: frontmatter.author ? String(frontmatter.author) : undefined,
          };
        })
      );
      loaded.sort((a, b) => (a.date < b.date ? 1 : -1));
      setMarkdownPosts(loaded);
    })();
  }, []);

  // Combine markdown posts with database posts
  const allPosts: Post[] = [
    ...dbPosts,
    ...markdownPosts.map(p => ({ ...p, rawDate: p.date, isHtml: false }))
  ];

  // Sort posts based on sortBy, but always pinned first
  const sortedPosts = useMemo(() => {
    const result = [...allPosts];
    switch (sortBy) {
      case "recent":
        result.sort((a, b) => {
          const dateA = a.rawDate || a.date || '';
          const dateB = b.rawDate || b.date || '';
          return dateB.localeCompare(dateA);
        });
        break;
      case "oldest":
        result.sort((a, b) => {
          const dateA = a.rawDate || a.date || '';
          const dateB = b.rawDate || b.date || '';
          return dateA.localeCompare(dateB);
        });
        break;
      case "title":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    // Always put pinned posts first
    return result.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }, [allPosts, sortBy]);

  const handleAdd = async (p: NewPost) => {
    // Removed user check to allow guests

    try {
      await createPost({
        title: p.title,
        type: p.attachments && p.attachments.length > 0 ? "Image" : "Text",
        content: p.content,
        attachments: p.attachments,
        gif_url: p.gif_url || null,
        draft: false,
        author_name: user?.username || user?.email || "Anonymous",
        author_email: user?.email || "",
        author_avatar: user?.avatarDataUrl || null,
        user_id: user?.id, // Optional
      });
      toast({ title: "Success", description: "Post created!" });
      setShowForm(false);
      // Reload posts
      window.location.reload();
    } catch (error) {
      console.error("Error creating post:", error);
      toast({ title: "Error", description: "Failed to create post", variant: "destructive" });
    }
  };

  return (
    <main className="flex-1">
      {/* Posts Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-4">
          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-black/50 border border-green-700/50 rounded px-2 py-1 text-sm text-green-400 focus:border-green-500 focus:outline-none"
            >
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
            </select>
          </div>

          {/* Add Post Button */}
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-black text-sm font-medium rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            Post
          </button>
        </div>
      </div>

      {/* User Panel */}
      <div className="mb-6">
        <UserPanel />
      </div>

      {/* New Post Form */}
      {showForm && (
        <div className="mb-6 p-4 bg-black/30 border border-green-700/50 rounded-lg">
          <AsciiNewPostForm onAdd={handleAdd} onClose={() => setShowForm(false)} />
        </div>
      )}

      {/* Posts Feed */}
      <div className="bg-black/20 rounded-lg">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm mt-3">Loading posts...</p>
          </div>
        ) : allPosts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No posts yet. Be the first to share something!
          </div>
        ) : (
          <div>
            {sortedPosts.map((post) => (
              <PostCard key={post.slug} post={post} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="text-center py-4 border-t border-green-900/30">
            <button
              onClick={async () => {
                if (!cursor || loadingMore) return;
                setLoadingMore(true);
                try {
                  const result = await listPostsFromDb({ limit: 30, cursor });
                  // Get profiles for the new posts
                  const newUserIds = [...new Set(result.posts.map(p => p.user_id).filter(Boolean))];
                  let userAvatars = new Map<string, string>();
                  let userUsernames = new Map<string, string>();
                  let userLastSeens = new Map<string, string>();
                  if (newUserIds.length > 0) {
                    const { data: profiles } = await supabase
                      .from('profiles')
                      .select('id, avatar_url, username, last_seen')
                      .in('id', newUserIds);
                    if (profiles) {
                      profiles.forEach(p => {
                        if (p.avatar_url) userAvatars.set(p.id, p.avatar_url);
                        if (p.username) userUsernames.set(p.id, p.username);
                        if (p.last_seen) userLastSeens.set(p.id, p.last_seen);
                      });
                    }
                  }
                  const newPosts = result.posts
                    .filter((p: any) => !p.hidden)
                    .map((p: any) => mapDbPostToPost(p, userUsernames, userAvatars, userLastSeens));
                  setDbPosts(prev => [...prev, ...newPosts]);
                  setCursor(result.nextCursor);
                  setHasMore(result.hasMore);
                } catch (error) {
                  console.error("[AsciiFeed] Error loading more posts:", error);
                } finally {
                  setLoadingMore(false);
                }
              }}
              disabled={loadingMore}
              className="text-green-400 hover:text-green-300 text-sm disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Show more'}
            </button>
          </div>
        )}
      </div>

      {/* View All Link */}
      <div className="mt-6 text-center">
        <Link to="/posts" className="text-gray-500 hover:text-green-400 text-sm">
          View all posts →
        </Link>
      </div>
    </main>
  );
};

export default AsciiFeed;
