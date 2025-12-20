import { useEffect, useState, useMemo } from "react";
import matter from "gray-matter";
import { Link, useNavigate } from "react-router-dom";
import AsciiNewPostForm, { NewPost } from "./AsciiNewPostForm";
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
  isPinned?: boolean;
  isHtml?: boolean;
  attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
};

interface FrontMatterData {
  title?: unknown;
  date?: unknown;
  author?: unknown;
}

const FILES = ["post1.md", "post2.md"]; // served from /public/posts

const AsciiFeed = () => {
  const navigate = useNavigate();
  const [markdownPosts, setMarkdownPosts] = useState<Post[]>([]);
  const [dbPosts, setDbPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [visibleCount, setVisibleCount] = useState(10);
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

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url, username');

        if (profiles) {
          profiles.forEach(p => {
            if (p.avatar_url) userAvatars.set(p.id, p.avatar_url);
            if (p.username) userUsernames.set(p.id, p.username);
          });
        }

        // Use listPostsFromDb for consistent attachment normalization
        const fromDb = await listPostsFromDb();
        const mapped: Post[] = (fromDb || [])
          .filter((p: any) => !p.hidden)
          .map((p: any) => {
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
              isHtml: true,
              isPinned: p.is_pinned || false,
              attachments: p.attachments?.map((a: any) => ({
                url: a.url || '',
                type: (String(a.type).toLowerCase() === 'music' ? 'music' : (String(a.type).toLowerCase().startsWith('video') ? 'video' : 'image')) as 'image' | 'video' | 'music'
              })).filter((a: any) => a.url) || undefined,
            };
          });
        setDbPosts(mapped);
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
    if (!user) {
      toast({ title: "Error", description: "Must be logged in", variant: "destructive" });
      return;
    }

    try {
      await createPost({
        title: p.title,
        type: p.attachments && p.attachments.length > 0 ? "Image" : "Text",
        content: p.content,
        attachments: p.attachments,
        draft: false,
        author_name: user.username || user.email || "Anonymous",
        author_email: user.email || "",
        author_avatar: user.avatarDataUrl || null,
        user_id: user.id,
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
          {user && (
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
            {sortedPosts.slice(0, visibleCount).map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        )}

        {/* Load More */}
        {sortedPosts.length > visibleCount && (
          <div className="text-center py-4 border-t border-green-900/30">
            <button
              onClick={() => setVisibleCount(prev => prev + 10)}
              className="text-green-400 hover:text-green-300 text-sm"
            >
              Show more ({sortedPosts.length - visibleCount} remaining)
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
