import { useEffect, useState, useMemo } from "react";
import matter from "gray-matter";
import { Link, useNavigate } from "react-router-dom";
import AsciiNewPostForm, { NewPost } from "./AsciiNewPostForm";
import UserPanel from "./UserPanel";
import { useAuth } from "@/context/AuthContext";
import { useSupabasePosts, createPost } from "@/hooks/useSupabasePosts";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { decodeHtml, stripHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import ReactionButtons from "@/components/reactions/ReactionButtons";
import MediaCarousel from "@/components/media/PostMediaCarousel";
import QuickActions from "@/components/QuickActions";
import { Pin, Paperclip, Eye } from "lucide-react";

type Post = {
  title: string; date: string; content: string; slug: string; author?: string; authorAvatar?: string; isPinned?: boolean;
  attachments?: { url: string; type: 'image' | 'video' }[];
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
  const { posts: dbPosts, loading } = useSupabasePosts();
  const [showForm, setShowForm] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [visibleCount, setVisibleCount] = useState(5); // Show 5 posts at a time
  const { user } = useAuth();
  const { toast } = useToast();

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

  // Combine markdown posts with database posts (filter out hidden)
  const allPosts = [
    ...dbPosts
      .filter(p => !p.hidden) // Filter hidden posts
      .map(p => {
        const createdDate = p.created_at ? new Date(p.created_at) : null;
        const formattedDate = createdDate
          ? createdDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })
          : '';
        return {
          title: p.title,
          date: formattedDate,
          rawDate: p.created_at || '',
          content: p.content || "",
          slug: p.id || p.title,
          author: p.author_username || p.author_name || undefined,
          authorAvatar: p.author_avatar || undefined,
          authorUsername: p.author_username || undefined,
          isHtml: true, // Database posts are HTML
          isPinned: p.is_pinned || false,
          attachments: (p.attachments as any[] | undefined)?.map((a: any) => ({ url: a.url || '', type: (a.type?.startsWith('video') ? 'video' : 'image') as 'image' | 'video' })).filter((a: any) => a.url) || undefined,
        };
      }),
    ...markdownPosts.map(p => ({ ...p, rawDate: p.date, isHtml: false }))
  ];

  // Sort posts based on sortBy, but always pinned first
  const sortedPosts = useMemo(() => {
    const result = [...allPosts];
    // First sort by the selected criteria
    switch (sortBy) {
      case "recent":
        result.sort((a, b) => ((a as any).rawDate < (b as any).rawDate ? 1 : -1));
        break;
      case "oldest":
        result.sort((a, b) => ((a as any).rawDate > (b as any).rawDate ? 1 : -1));
        break;
      case "title":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    // Then move pinned posts to top while preserving their relative order
    return result.sort((a, b) => {
      if ((a as any).isPinned && !(b as any).isPinned) return -1;
      if (!(a as any).isPinned && (b as any).isPinned) return 1;
      return 0;
    });
  }, [allPosts, sortBy]);


  async function handleAdd(p: NewPost) {
    try {
      // Get the Supabase user ID if available
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();

      // Allow post creation even without Supabase auth
      // user_id will be null for anonymous posts
      await createPost({
        title: p.title,
        type: "Text",
        content: p.content,
        draft: false,
        author_name: user?.username || supabaseUser?.email || "Anonymous",
        author_email: user?.email || supabaseUser?.email || "",
        user_id: supabaseUser?.id || null,
      });

      toast({
        title: "Success",
        description: "Post created successfully!",
      });

      setShowForm(false);
    } catch (error) {
      console.error("Error creating post:", error);
      toast({
        title: "Error",
        description: "Failed to create post. Please check your Supabase configuration.",
        variant: "destructive",
      });
    }
  }

  return (
    <main className="ascii-text flex-1">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="ascii-highlight text-2xl">Recent Posts</h2>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Sorting buttons */}
          <div className="flex gap-1 text-xs">
            <span className="ascii-dim">Sort:</span>
            {(["recent", "oldest", "title"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={cn(
                  "px-2 py-0.5 border border-green-600 transition-colors",
                  sortBy === option ? "bg-green-600 text-black" : "hover:bg-green-600/20"
                )}
              >
                {option === "recent" ? "Recent" : option === "oldest" ? "Oldest" : "A-Z"}
              </button>
            ))}
          </div>
          <button
            className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1"
            onClick={() => setShowForm((s) => !s)}
          >
            {showForm ? "Close" : "Add Post"}
          </button>
        </div>
      </div>
      <div className="mb-6">
        <UserPanel />
      </div>
      {showForm && (
        <div className="mb-6">
          <AsciiNewPostForm onAdd={handleAdd} onClose={() => setShowForm(false)} />
        </div>
      )}
      <div className="space-y-6">
        {loading ? (
          <div className="ascii-dim text-center">Loading posts...</div>
        ) : allPosts.length === 0 ? (
          <div className="ascii-dim">No posts yet. Add markdown files to /public/posts or create a post above.</div>
        ) : (
          sortedPosts.slice(0, visibleCount).map((post) => (
            <div
              key={post.slug}
              onClick={() => navigate(`/post/${post.slug}`)}
              className="block cursor-pointer"
            >
              <article className="group relative border border-green-600 bg-black/60 p-4 hover:border-green-400 hover:bg-black/80 transition-colors">
                {/* Quick Actions - appear on hover */}
                <QuickActions
                  postId={post.slug}
                  postTitle={post.title}
                  postSlug={post.slug}
                  className="absolute top-2 right-2 z-10"
                />

                {/* Pinned label like Twitter */}
                {(post as any).isPinned && (
                  <div className="flex items-center gap-2 text-xs text-yellow-400 mb-2">
                    <Pin className="w-3 h-3" />
                    <span>Pinned post</span>
                  </div>
                )}
                <div className="flex gap-4">
                  {/* Author Avatar on Left with username below */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    {(post as any).authorAvatar ? (
                      <img
                        src={(post as any).authorAvatar}
                        alt={post.author || "Author"}
                        className="w-14 h-14 rounded-lg border-2 border-green-600 object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg border-2 border-green-600 bg-green-900/30 flex items-center justify-center">
                        <span className="text-2xl text-green-500">
                          {(post.author || "?")[0]?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    {post.author && (
                      <Link
                        to={`/user/${(post as any).authorUsername || post.author}`}
                        className="text-xs text-green-400 text-center hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        @{(post as any).authorUsername || post.author}
                      </Link>
                    )}
                  </div>
                  {/* Post Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="ascii-highlight text-xl mb-1">
                      {post.title}
                    </h3>
                    <div className="ascii-dim text-xs mb-3">
                      {post.date}
                    </div>
                    <div className="prose prose-invert max-w-none text-green-400/80">
                      {(post as any).isHtml ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: decodeHtml(post.content.length > 400
                              ? stripHtml(post.content).slice(0, 400) + '...'
                              : post.content)
                          }}
                        />
                      ) : (
                        <div>{post.content.length > 400 ? post.content.slice(0, 400) + '...' : post.content}</div>
                      )}
                    </div>

                    {/* Media Carousel - inline media preview */}
                    {(post as any).attachments && (post as any).attachments.length > 0 && (
                      <div className="mt-4" onClick={(e) => e.preventDefault()}>
                        <MediaCarousel media={(post as any).attachments} compact />
                      </div>
                    )}
                  </div>
                </div>
                {/* Reactions */}
                <div className="mt-3 pt-2 border-t border-green-600/30" onClick={(e) => e.preventDefault()}>
                  <ReactionButtons postId={post.slug} />
                </div>
              </article>
            </div>
          ))
        )}

        {/* Show More Button */}
        {sortedPosts.length > visibleCount && (
          <div className="text-center py-4">
            <button
              onClick={() => setVisibleCount(prev => prev + 5)}
              className="ascii-nav-link hover:ascii-highlight border border-green-600 px-6 py-2 text-sm"
            >
              Show More ({visibleCount} of {sortedPosts.length} posts)
            </button>
          </div>
        )}

        {sortedPosts.length > 0 && visibleCount >= sortedPosts.length && (
          <div className="text-center py-2 ascii-dim text-xs">
            Showing all {sortedPosts.length} posts
          </div>
        )}
      </div>
      <div className="mt-6">
        <Link to="/posts" className="ascii-nav-link hover:ascii-highlight">View all posts</Link>
      </div>
    </main>
  );
};

export default AsciiFeed;
