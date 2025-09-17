import { supabase } from "@/lib/supabase";
import type { User } from "@/context/AuthContext";

export type DbPost = {
  id?: string;
  title: string;
  type: "Text" | "Image" | "Video" | "Link";
  content?: string | null;
  attachments?: any | null; // JSON payload of attachments metadata
  author_name?: string | null;
  author_email?: string | null;
  user_id?: string | null;
  created_at?: string;
};

const LOCAL_KEY = "userPosts";

export async function addPostToDb(post: DbPost): Promise<DbPost | null> {
  if (!supabase) return null;
  // Attach current Supabase user id if available
  let user_id: string | null = post.user_id ?? null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    user_id = userData?.user?.id ?? user_id ?? null;
  } catch {}
  const { data, error } = await supabase
    .from("posts")
    .insert({ ...post, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as DbPost;
}

export function addPostLocal(post: DbPost) {
  const arr = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  arr.unshift({ ...post, created_at: new Date().toISOString() });
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
  return (data || []) as DbPost[];
}

export function listPostsLocal(): DbPost[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as DbPost[];
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
    attachments: attachments?.map((f) => ({ name: f.name, size: f.size, type: f.type })) || null,
    author_name: user?.displayName || null,
    author_email: user?.email || null,
  } satisfies DbPost;
}
