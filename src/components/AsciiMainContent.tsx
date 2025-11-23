import { useEffect, useState } from "react";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import AsciiNewPostForm, { NewPost } from "./AsciiNewPostForm";
import UserPanel from "./UserPanel";
import { useAuth } from "@/context/AuthContext";
import { useSupabasePosts, createPost } from "@/hooks/useSupabasePosts";
import { useToast } from "@/hooks/use-toast";

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
    ...dbPosts.map(p => ({
      title: p.title,
      date: p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : "",
      content: p.content || "",
      slug: p.id || p.title,
      author: p.author_name || undefined,
    })),
    ...markdownPosts
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  async function handleAdd(p: NewPost) {
    try {
      await createPost({
        title: p.title,
        type: "Text",
        content: p.content,
        draft: false,
        author_name: user?.displayName || "Anonymous",
        author_email: user?.email || "",
        user_id: user?.uid,
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
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown>
                  {post.content.length > 400 ? post.content.slice(0, 400) + "..." : post.content}
                </ReactMarkdown>
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
