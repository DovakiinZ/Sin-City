import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import matter from "gray-matter";
import { cn } from "@/lib/utils";

type Post = {
  title: string;
  date: string;
  content: string;
  slug: string;
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
          };
        })
      );
      // newest first if date exists
      loaded.sort((a, b) => (a.date < b.date ? 1 : -1));
      setPosts(loaded);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <AsciiBox>
          <div className="text-center">
            <div className="text-xl">+-[ SIN-CITY BLOG ]-+</div>
            <div className="opacity-70 text-sm">ASCII journal of thoughts, images & videos</div>
          </div>
        </AsciiBox>

        {posts.map((post) => (
          <AsciiBox key={post.slug} className="space-y-3">
            <div className="text-lg">+-- {post.title} --+</div>
            {post.date && <div className="text-xs opacity-70">{post.date}</div>}
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
