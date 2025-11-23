import { useEffect, useState } from "react";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import AsciiNewPostForm, { NewPost } from "./AsciiNewPostForm";
import UserPanel from "./UserPanel";
import { useAuth } from "@/context/AuthContext";

type Post = { title: string; date: string; content: string; slug: string; author?: string };

interface FrontMatterData {
  title?: unknown;
  date?: unknown;
  author?: unknown;
}

const FILES = ["post1.md", "post2.md"]; // served from /public/posts

const AsciiMainContent = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [showForm, setShowForm] = useState(false);
  const { user } = useAuth();

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
      // include locally saved posts
      const stored = JSON.parse(localStorage.getItem("userPosts") || "[]") as Post[];
      const all = [...stored, ...loaded];
      all.sort((a, b) => (a.date < b.date ? 1 : -1));
      setPosts(all);
    })();
  }, []);

  function toSlug(s: string) {
    return (
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-") + "-" + Date.now()
    );
  }

  function handleAdd(p: NewPost) {
    const username = user?.displayName || localStorage.getItem("username") || undefined;
    const newPost: Post = {
      title: p.title,
      date: p.date || new Date().toISOString().slice(0, 10),
      content: p.content,
      slug: toSlug(p.title),
      author: username,
    };
    const current = JSON.parse(localStorage.getItem("userPosts") || "[]") as Post[];
    const updated = [newPost, ...current];
    localStorage.setItem("userPosts", JSON.stringify(updated));
    setPosts((prev) => [newPost, ...prev]);
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
        {posts.map((post) => (
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
        ))}

        {posts.length === 0 && (
          <div className="ascii-dim">No posts yet. Add markdown files to /public/posts.</div>
        )}
      </div>
      <div className="mt-6">
        <Link to="/posts" className="ascii-nav-link hover:ascii-highlight">View all posts</Link>
      </div>
    </main>
  );
};

export default AsciiMainContent;
