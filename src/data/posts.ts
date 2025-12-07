import { supabase } from "@/lib/supabase";
import type { User } from "@/context/AuthContext";

export type AttachmentMetadata = {
  name: string;
  size: number;
  type: string;
  url?: string | null;
};

export type DbPost = {
  id?: string;
  slug?: string | null;
  title: string;
  type: "Text" | "Image" | "Video" | "Link";
  content?: string | null;
  attachments?: AttachmentMetadata[] | null;
  author_name?: string | null;
  author_email?: string | null;
  author_avatar?: string | null;
  user_id?: string | null;
  created_at?: string;
  draft?: boolean;
};

const normalizeAttachments = (value: unknown): AttachmentMetadata[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : null;
      const rawSize = record.size;
      const size =
        typeof rawSize === "number"
          ? rawSize
          : typeof rawSize === "string" && rawSize.trim().length > 0
            ? Number.parseInt(rawSize, 10)
            : null;
      const type = typeof record.type === "string" ? record.type : "";
      const url = typeof record.url === "string" ? record.url : null;
      if (!name || size === null || Number.isNaN(size)) return null;
      return { name, size, type, url } as AttachmentMetadata;
    })
    .filter((item): item is AttachmentMetadata => item !== null);
  return normalized.length > 0 ? normalized : null;
};

/**
 * Add a post to Supabase database
 * All posts are now stored in the database - no localStorage fallback
 */
export async function addPostToDb(post: DbPost): Promise<DbPost | null> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file");
  }

  // Attach current Supabase user id if available
  let user_id: string | null = post.user_id ?? null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    user_id = userData?.user?.id ?? user_id ?? null;
  } catch (error) {
    // Silently handle auth errors - user may not be logged in
    // This is expected behavior and not an error condition
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({ ...post, user_id })
    .select()
    .single();

  if (error) throw error;
  return data ? ({ ...data, attachments: normalizeAttachments(data.attachments) } as DbPost) : null;
}

/**
 * List all posts from Supabase database
 * All posts are fetched from the database - no localStorage fallback
 */
export async function listPostsFromDb(): Promise<DbPost[]> {
  if (!supabase) {
    console.error("[listPostsFromDb] Supabase is not configured");
    throw new Error("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file");
  }

  console.log("[listPostsFromDb] Fetching posts from database...");

  // RLS policies will filter for published posts (draft = false)
  // Removing explicit .eq("draft", false) to prevent query hanging
  const { data, error } = await supabase
    .from("posts")
    .select("id,slug,title,type,content,attachments,author_name,author_email,author_avatar,user_id,created_at,draft")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[listPostsFromDb] Error fetching posts:", error);
    throw error;
  }

  console.log(`[listPostsFromDb] Successfully fetched ${data?.length || 0} posts`);

  return (data || []).map(
    (p) =>
      ({
        ...p,
        attachments: normalizeAttachments(p.attachments),
      }) as DbPost,
  );
}

/**
 * Helper function to convert form data to DbPost format
 */
export function toDbPost(input: {
  title: string;
  type: DbPost["type"];
  content?: string;
  attachments?: File[];
  user?: User | null;
  draft?: boolean;
}): DbPost {
  const { title, type, content, attachments, user, draft } = input;
  return {
    title,
    type,
    content: content || null,
    draft: draft ?? false,
    attachments:
      attachments && attachments.length > 0
        ? attachments.map<AttachmentMetadata>((f) => ({ name: f.name, size: f.size, type: f.type }))
        : null,
    author_name: user?.displayName || null,
    author_email: user?.email || null,
    author_avatar: user?.avatarDataUrl || null,
  } satisfies DbPost;
}
