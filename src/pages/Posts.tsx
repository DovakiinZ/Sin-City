import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { useAuth } from "@/context/AuthContext";
import matter from "gray-matter";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import { listPostsFromDb } from "@/data/posts";
import { estimateReadTime, extractHeadings, slugify } from "@/lib/markdown";
import { useLocation, useNavigate, Link } from "react-router-dom";
import CommentList from "@/components/comments/CommentList";
import ReactionButtons from "@/components/reactions/ReactionButtons";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type Post = {
  title: string;
  date: string;
  content: string;
  slug: string;
  author?: string;
  authorAvatar?: string;
  tags?: string[];
  draft?: boolean;
};

interface FrontMatterData {
  title?: unknown;
  date?: unknown;
  author?: unknown;
  tags?: unknown;
  draft?: unknown;
}

const FILES = ["post1.md", "post2.md"];

const AsciiBox = forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "font-mono rounded-none border p-4 bg-black text-green-400 border-green-600 shadow-[0_0_0_1px_#16a34a_inset]",
          className
        )}
      >
        {children}
      </div>
    );
  }
);
AsciiBox.displayName = "AsciiBox";

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const qParam = params.get("q") || "";
  const tagParam = params.get("tag") || "";
  const [query, setQuery] = useState(qParam);
  const selectedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      console.log("[Posts] Starting to fetch posts...");

      // Fetch posts directly from Supabase (like admin does)
      let allPosts: Post[] = [];
      try {
        const fromDb = await listPostsFromDb();
        console.log(`[Posts] Fetched ${fromDb?.length || 0} posts from database`);
        allPosts = (fromDb || []).map((p: any) => ({
          title: p.title,
          date: p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "",
          content: p.content || "",
          slug: p.id || slugify(p.title),
          author: p.author_name || undefined,
          authorAvatar: p.author_avatar || undefined,
          draft: p.draft || false,
        }));
      } catch (error) {
        console.error("[Posts] Error loading posts from database:", error);
      }

      const showDrafts = import.meta.env.VITE_SHOW_DRAFTS === "true";
      const filtered = allPosts.filter((p) => (showDrafts ? true : !p.draft));
      filtered.sort((a, b) => (a.date < b.date ? 1 : -1));
      console.log(`[Posts] Total posts to display: ${filtered.length}`);
      setPosts(filtered);
      setIsLoading(false);
    })();
  }, []); // No dependencies - run once on mount

  const uniqueTags = useMemo(() => {
    const s = new Set<string>();
    posts.forEach((p) => p.tags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      const tagOk = tagParam ? p.tags?.map((t) => t.toLowerCase()).includes(tagParam.toLowerCase()) : true;
      const qOk = q
        ? [p.title, p.author, p.content, ...(p.tags || [])]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(q))
        : true;
      return tagOk && qOk;
    });
  }, [posts, query, tagParam]);

  // Keyboard nav j/k across boxes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "j" && e.key !== "k") return;
      e.preventDefault();
      const boxes = Array.from(document.querySelectorAll<HTMLDivElement>("[data-post-box]"));
      if (boxes.length === 0) return;
      const idx = boxes.findIndex((el) => el === selectedRef.current);
      let nextIdx = 0;
      if (e.key === "j") nextIdx = Math.min(boxes.length - 1, Math.max(0, (idx ?? -1) + 1));
      if (e.key === "k") nextIdx = Math.max(0, Math.min(boxes.length - 1, (idx ?? 0) - 1));
      selectedRef.current = boxes[nextIdx];
      boxes[nextIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
      boxes.forEach((b, i) => b.classList.toggle("ring-2", i === nextIdx));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

        {isLoading ? (
          <AsciiBox>
            <div className="text-center animate-pulse" role="status" aria-label="Loading posts">
              <div className="text-xl mb-2">Loading posts...</div>
              <div className="opacity-70 text-sm">Please wait while we fetch the content</div>
            </div>
          </AsciiBox>
        ) : (
          <>
            <AsciiBox>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      const p = new URLSearchParams(location.search);
                      if (e.target.value) p.set("q", e.target.value);
                      else p.delete("q");
                      navigate({ pathname: location.pathname, search: p.toString() }, { replace: true });
                    }}
                    placeholder="Search title, content, tags..."
                    className="w-full bg-black text-green-400 border border-green-600 px-2 py-1 font-mono"
                    aria-label="Search posts"
                  />
                </div>
                {uniqueTags.length > 0 && (
                  <div className="text-xs flex flex-wrap gap-2">
                    <span className="ascii-dim">Tags:</span>
                    {uniqueTags.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          const p = new URLSearchParams(location.search);
                          if ((params.get("tag") || "").toLowerCase() === t.toLowerCase()) p.delete("tag");
                          else p.set("tag", t);
                          navigate({ pathname: location.pathname, search: p.toString() });
                        }}
                        className={cn(
                          "px-1 border border-green-600",
                          (params.get("tag") || "").toLowerCase() === t.toLowerCase() ? "ascii-highlight" : ""
                        )}
                        aria-label={`Filter by tag ${t}`}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </AsciiBox>

            {filtered.map((post, i) => {
              const headings = extractHeadings(post.content);
              const readMins = estimateReadTime(post.content);
              return (
                <AsciiBox
                  key={post.slug}
                  className="space-y-3 ring-green-600"
                  data-post-box
                  ref={i === 0 ? (el) => { if (!selectedRef.current) selectedRef.current = el; } : undefined}
                >
                  <div className="text-lg">
                    <Link
                      to={`/post/${post.slug}`}
                      className="hover:ascii-highlight"
                    >
                      +-- {post.title} --+
                    </Link>
                  </div>
                  {(post.date || post.author) && (
                    <div className="text-xs opacity-70 flex flex-wrap gap-3 items-center">
                      <span>{post.date}</span>
                      {post.author && (
                        <span className="flex items-center gap-2">
                          » by
                          {post.authorAvatar && (
                            <Avatar className="w-5 h-5 inline-block">
                              <AvatarImage src={post.authorAvatar} alt={post.author} />
                              <AvatarFallback className="text-[8px] bg-green-900 text-green-400">
                                {post.author.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span className="ascii-highlight">{post.author}</span>
                        </span>
                      )}
                      <span className="ascii-dim">{readMins} min read</span>
                      {post.tags && post.tags.length > 0 && (
                        <span className="flex gap-1 items-center">
                          {post.tags.map((t) => (
                            <button
                              key={t}
                              onClick={() => {
                                const p = new URLSearchParams(location.search);
                                p.set("tag", t);
                                navigate({ pathname: location.pathname, search: p.toString() });
                              }}
                              className="text-xs border border-green-600 px-1"
                            >
                              #{t}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  )}

                  {headings.length > 0 && (
                    <div className="text-xs ascii-dim">
                      <span className="mr-2">TOC:</span>
                      {headings.map((h) => (
                        <a key={h.id} href={`#${h.id}`} className="mr-2 hover:ascii-highlight">
                          {"".padStart(Math.max(0, h.depth - 2) * 2, " ")}
                          {h.text}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="prose prose-invert max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: post.content }} />
                  </div>
                </AsciiBox>
              );
            })}

            {filtered.length === 0 && !isLoading && (
              <AsciiBox>
                <div className="text-center space-y-2">
                  <div className="text-lg">No posts found</div>
                  <div className="ascii-dim text-sm">
                    {posts.length === 0
                      ? "No published posts yet. Create your first post!"
                      : "No posts match your search criteria."}
                  </div>
                  {posts.length === 0 && (
                    <div className="pt-2">
                      <Link to="/create" className="ascii-nav-link hover:ascii-highlight border border-green-600 px-3 py-1 inline-block">
                        → Create Post
                      </Link>
                    </div>
                  )}
                </div>
              </AsciiBox>
            )}
          </>
        )}
      </div>
    </div>
  );
}
