import { useEffect, useState } from "react";
import matter from "gray-matter";
import { Link } from "react-router-dom";
import AsciiNewPostForm, { NewPost } from "./AsciiNewPostForm";
import UserPanel from "./UserPanel";
import { useAuth } from "@/context/AuthContext";
import { useSupabasePosts, createPost } from "@/hooks/useSupabasePosts";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { decodeHtml, stripHtml } from "@/lib/markdown";

type Post = { title: string; date: string; content: string; slug: string; author?: string };

interface FrontMatterData {
  title?: unknown;
  date?: unknown;
  author?: unknown;
}

const FILES = ["post1.md", "post2.md"]; // served from /public/posts

const AsciiMainContent = () => {
  const [markdownPosts, setMarkdownPosts] = useState<Post[]>([]);
  const { posts: dbPosts, loading } = useSupabasePosts();
  const [showForm, setShowForm] = useState(false);
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

  // Combine markdown posts with database posts
  const allPosts = [
    ...dbPosts.map(p => {
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
        author: p.author_name || undefined,
        isHtml: true, // Database posts are HTML
      };
    }),
    ...markdownPosts
  ].sort((a, b) => (a.date < b.date ? 1 : -1));


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
        author_name: user?.displayName || supabaseUser?.email || "Anonymous",
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
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="ascii-highlight text-2xl">Recent Posts</h2>
        <button
          className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? "Close" : "Add Post"}
        </button>
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
          allPosts.map((post) => (
            <article key={post.slug} className="border border-green-600 bg-black/60 p-4">
              <h3 className="ascii-highlight text-xl mb-1">{post.title}</h3>
              <div className="ascii-dim text-xs mb-3">
                {post.date}
                {post.author && <> • by <span className="ascii-highlight">{post.author}</span></>}
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
            </article>
          ))
        )}
      </div>
      <div className="mt-6">
        <Link to="/posts" className="ascii-nav-link hover:ascii-highlight">View all posts</Link>
      </div>
    </main>
  );
};

export default AsciiMainContent;
