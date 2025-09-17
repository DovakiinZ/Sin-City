import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import ReactMarkdown from "react-markdown";
import matter from "gray-matter";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import { listPostsFromDb, listPostsLocal } from "@/data/posts";

type Post = {
  title: string;
  date: string;
  content: string;
  slug: string;
  author?: string;
};

const FILES = ["post1.md", "post2.md"];

function AsciiBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "font-mono rounded-none border p-4 bg-black text-green-400 border-green-600 shadow-[0_0_0_1px_#16a34a_inset]",
        className
      )}
    >
      {children}
    </div>
  );
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    (async () => {
      const loaded = await Promise.all(
        FILES.map(async (file) => {
          const res = await fetch(`/posts/${file}`);
          const text = await res.text();
          const { data, content } = matter(text);
          return {
            title: String((data as any).title || file),
            date: String((data as any).date || ""),
            content,
            slug: file.replace(/\.md$/, ""),
            author: (data as any).author ? String((data as any).author) : undefined,
          };
        })
      );
      // Try Supabase first, fall back to local storage demo posts
      let dbPosts: Post[] = [];
      try {
        const fromDb = await listPostsFromDb();
        dbPosts = fromDb.map((p) => ({
          title: p.title,
          date: p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "",
          content: p.content || "",
          slug: p.id || p.title + Math.random().toString(36).slice(2),
          author: p.author_name || undefined,
        }));
      } catch {
        const fromLocal = listPostsLocal();
        dbPosts = fromLocal.map((p) => ({
          title: p.title,
          date: p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "",
          content: p.content || "",
          slug: p.title + Math.random().toString(36).slice(2),
          author: p.author_name || user?.displayName,
        }));
      }
      const all = [...dbPosts, ...loaded];
      all.sort((a, b) => (a.date < b.date ? 1 : -1));
      setPosts(all);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <BackButton />
        </div>
        <AsciiBox>
          <div className="text-center">
            <div className="text-xl">+-[ SIN-CITY BLOG ]-+</div>
            <div className="opacity-70 text-sm">ASCII journal of thoughts, images & videos</div>
          </div>
        </AsciiBox>

        {posts.map((post) => (
          <AsciiBox key={post.slug} className="space-y-3">
            <div className="text-lg">+-- {post.title} --+</div>
            {(post.date || post.author) && (
              <div className="text-xs opacity-70">
                {post.date}
                {post.author && <> • by <span className="ascii-highlight">{post.author}</span></>}
              </div>
            )}
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown>{post.content}</ReactMarkdown>
            </div>
          </AsciiBox>
        ))}

        {posts.length === 0 && (
          <AsciiBox>
            <div>No posts yet. Drop markdown files in <code>/public/posts</code>.</div>
          </AsciiBox>
        )}
      </div>
    </div>
  );
}
