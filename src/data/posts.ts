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
  title: string;
  type: "Text" | "Image" | "Video" | "Link";
  content?: string | null;
  attachments?: AttachmentMetadata[] | null;
  author_name?: string | null;
  author_email?: string | null;
  user_id?: string | null;
  created_at?: string;
};

const LOCAL_KEY = "userPosts";

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
      return { name, size, type, url };
    })
    .filter((item): item is AttachmentMetadata => item !== null);
  return normalized.length > 0 ? normalized : null;
};

export async function addPostToDb(post: DbPost): Promise<DbPost | null> {
  if (!supabase) return null;
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

export function addPostLocal(post: DbPost) {
  const raw = localStorage.getItem(LOCAL_KEY);
  const arr: DbPost[] = raw ? (JSON.parse(raw) as DbPost[]) : [];
  arr.unshift({
    ...post,
    attachments: normalizeAttachments(post.attachments) ?? null,
    created_at: new Date().toISOString(),
  });
  localStorage.setItem(LOCAL_KEY, JSON.stringify(arr));
}

export async function listPostsFromDb(): Promise<DbPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("posts")
    .select("id,title,type,content,attachments,author_name,author_email,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map(
    (p) =>
      ({
        ...p,
        attachments: normalizeAttachments(p.attachments),
      }) as DbPost,
  );
}

export function listPostsLocal(): DbPost[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as DbPost[];
    return parsed.map((p) => ({ ...p, attachments: normalizeAttachments(p.attachments) }));
  } catch {
    return [];
  }
}

export function toDbPost(input: { title: string; type: DbPost["type"]; content?: string; attachments?: File[]; user?: User | null }): DbPost {
  const { title, type, content, attachments, user } = input;
  return {
    title,
    type,
    content: content || null,
    attachments:
      attachments && attachments.length > 0
        ? attachments.map<AttachmentMetadata>((f) => ({ name: f.name, size: f.size, type: f.type }))
        : null,
    author_name: user?.displayName || null,
    author_email: user?.email || null,
  } satisfies DbPost;
}
