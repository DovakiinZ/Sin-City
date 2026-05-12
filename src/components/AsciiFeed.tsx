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
import PostCard, { BatchPollData, BatchReactionData } from "@/components/PostCard";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useContentAuthor, useIdentity } from "@/hooks/useIdentity";

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
  is_registered_only?: boolean;
  is_deleted?: boolean;
  author_role?: string;
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
  userLastSeens: Map<string, string>,
  userRoles: Map<string, string>
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
    textAlign: p.text_align || undefined,  // Text alignment
    isHtml: true,
    isPinned: p.is_pinned || false,
    attachments: p.attachments?.map((a: any) => ({
      url: a.url || '',
      type: (String(a.type).toLowerCase() === 'music' ? 'music' : (String(a.type).toLowerCase().startsWith('video') ? 'video' : 'image')) as 'image' | 'video' | 'music'
    })).filter((a: any) => a.url) || undefined,
    gif_url: p.gif_url || undefined,
    music_metadata: p.music_metadata || undefined,
    is_registered_only: p.is_registered_only || false,
    is_deleted: p.is_deleted || false,
    author_role: p.user_id ? userRoles.get(p.user_id) : undefined,
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
  const [allowAnonPosts, setAllowAnonPosts] = useState<boolean | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { user_id, guest_id, isReady } = useContentAuthor();
  const { identity } = useIdentity();

  // Batch data maps for polls and reactions
  const [pollsMap, setPollsMap] = useState<Map<string, BatchPollData>>(new Map());
  const [reactionsMap, setReactionsMap] = useState<Map<string, BatchReactionData>>(new Map());

  // Soft-delete: mark post as deleted (visible only to admin)
  const handleSoftDelete = async (postId: string) => {
    const { error } = await supabase
      .from('posts')
      .update({ is_deleted: true })
      .eq('id', postId);

    if (error) {
      toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
      return;
    }
    toast({ title: "Post deleted", description: "Your post has been removed" });
    // Remove from local state (admin still sees via DB)
    setDbPosts(prev => prev.filter(p => p.postId !== postId));
  };

  // Load posts from database — parallelized for performance
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Run posts + settings fetch in parallel (profiles fetched after posts)
        const [postsResult, settingResult] = await Promise.all([
          listPostsFromDb({ limit: 50 }),
          supabase.from('site_settings').select('value').eq('id', 'allow_anonymous_posts').single(),
        ]);

        // Handle settings
        if (settingResult.data) {
          const val = settingResult.data.value === true || settingResult.data.value === 'true';
          setAllowAnonPosts(val);
        } else {
          setAllowAnonPosts(true);
        }

        const filteredPosts = (postsResult.posts || []).filter((p: any) => !p.hidden);

        // Collect unique user IDs from posts, then fetch only those profiles
        const userIds = [...new Set(filteredPosts.map((p: any) => p.user_id).filter(Boolean))] as string[];
        const postIds = filteredPosts.map((p: any) => p.id).filter(Boolean) as string[];

        // Fetch profiles, polls, and reactions in parallel
        const [profilesResult, pollsResult, reactionsResult] = await Promise.all([
          userIds.length > 0
            ? supabase.from('profiles').select('id, avatar_url, username, last_seen, role').in('id', userIds)
            : { data: null },
          postIds.length > 0
            ? supabase.from('post_polls').select('*, options:post_poll_options(*), votes:post_poll_votes(*)').in('post_id', postIds)
            : { data: null },
          postIds.length > 0
            ? supabase.from('reactions').select('post_id, user_id, reaction_type').in('post_id', postIds)
            : { data: null },
        ]);

        // Build profiles maps
        const userAvatars: Map<string, string> = new Map();
        const userUsernames: Map<string, string> = new Map();
        const userLastSeens: Map<string, string> = new Map();
        const userRoles: Map<string, string> = new Map();

        if (profilesResult.data) {
          profilesResult.data.forEach(p => {
            if (p.avatar_url) userAvatars.set(p.id, p.avatar_url);
            if (p.username) userUsernames.set(p.id, p.username);
            if (p.last_seen) userLastSeens.set(p.id, p.last_seen);
            if (p.role) userRoles.set(p.id, p.role);
          });
          // Check if current user is admin
          if (user?.id) {
            const currentProfile = profilesResult.data.find(p => p.id === user.id);
            if (currentProfile && (currentProfile as any).role === 'admin') {
              setIsAdmin(true);
            }
          }
        }

        // Build polls map (postId -> BatchPollData)
        const newPollsMap = new Map<string, BatchPollData>();
        if (pollsResult.data) {
          pollsResult.data.forEach((poll: any) => {
            newPollsMap.set(poll.post_id, {
              id: poll.id,
              question: poll.question,
              post_id: poll.post_id,
              options: poll.options || [],
              votes: poll.votes || [],
            });
          });
        }
        setPollsMap(newPollsMap);

        // Build reactions map (postId -> { likeCount, hasLiked })
        const newReactionsMap = new Map<string, BatchReactionData>();
        if (reactionsResult.data) {
          const grouped = new Map<string, { likes: number; userLiked: boolean }>();
          reactionsResult.data.forEach((r: any) => {
            const entry = grouped.get(r.post_id) || { likes: 0, userLiked: false };
            if (r.reaction_type === 'like') {
              entry.likes++;
              if (user?.id && r.user_id === user.id) entry.userLiked = true;
            }
            grouped.set(r.post_id, entry);
          });
          grouped.forEach((val, postId) => {
            newReactionsMap.set(postId, { likeCount: val.likes, hasLiked: val.userLiked });
          });
        }
        setReactionsMap(newReactionsMap);

        const mapped: Post[] = filteredPosts
          .map((p: any) => mapDbPostToPost(p, userUsernames, userAvatars, userLastSeens, userRoles));
        setDbPosts(mapped);
        setCursor(postsResult.nextCursor);
        setHasMore(postsResult.hasMore);
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
        author_name: user?.username || user?.email || identity?.anon_id || "Anonymous",
        author_email: user?.email || "",
        author_avatar: user?.avatarDataUrl || null,
        user_id: user?.id || null,
        guest_id: guest_id || null,
        is_registered_only: p.is_registered_only || false,
      }, p.pollData);
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

          {/* Add Post Button - Only show if user is logged in OR anonymous posting is explicitly allowed */}
          {(user || allowAnonPosts === true) && (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-black text-sm font-medium rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              Post
            </button>
          )}
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
              <PostCard
                key={post.slug}
                post={post}
                isAdmin={isAdmin}
                onDelete={handleSoftDelete}
                batchPoll={pollsMap.get(post.postId || '') || null}
                batchReaction={reactionsMap.get(post.postId || '') || { likeCount: 0, hasLiked: false }}
              />
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
                  const userAvatars = new Map<string, string>();
                  const userUsernames = new Map<string, string>();
                  const userLastSeens = new Map<string, string>();
                  const userRoles = new Map<string, string>();
                  if (newUserIds.length > 0) {
                    const { data: profiles } = await supabase
                      .from('profiles')
                      .select('id, avatar_url, username, last_seen, role')
                      .in('id', newUserIds);
                    if (profiles) {
                      profiles.forEach(p => {
                        if (p.avatar_url) userAvatars.set(p.id, p.avatar_url);
                        if (p.username) userUsernames.set(p.id, p.username);
                        if (p.last_seen) userLastSeens.set(p.id, p.last_seen);
                        if (p.role) userRoles.set(p.id, p.role);
                      });
                    }
                  }
                  const newPosts = result.posts
                    .filter((p: any) => !p.hidden)
                    .map((p: any) => mapDbPostToPost(p, userUsernames, userAvatars, userLastSeens, userRoles));
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
