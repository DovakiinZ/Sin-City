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
  text_align?: 'right' | 'center' | 'left';  // Text alignment for rendering
  attachments?: AttachmentMetadata[] | null;
  gif_url?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  author_avatar?: string | null;
  user_id?: string | null;
  guest_id?: string | null; // For anonymous posts
  anonymous_id?: string | null; // Human-readable ANON-XXXX for admin view
  created_at?: string;
  draft?: boolean;
  view_count?: number;
  is_pinned?: boolean;
  thread_id?: string | null;
  thread_position?: number | null;
};

const normalizeAttachments = (value: unknown): AttachmentMetadata[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;

      // Support new format with just url and type (from media uploads)
      const url = typeof record.url === "string" ? record.url : null;
      const type = typeof record.type === "string" ? record.type : "";

      // If we have a URL, that's enough for the new media format
      if (url) {
        const name = typeof record.name === "string" ? record.name : url.split('/').pop() || 'media';
        const rawSize = record.size;
        const size = typeof rawSize === "number" ? rawSize : 0;
        return { name, size, type, url } as AttachmentMetadata;
      }

      // Legacy format requires name and size
      const name = typeof record.name === "string" ? record.name : null;
      const rawSize = record.size;
      const size =
        typeof rawSize === "number"
          ? rawSize
          : typeof rawSize === "string" && rawSize.trim().length > 0
            ? Number.parseInt(rawSize, 10)
            : null;
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
 * Pagination options for listing posts
 */
export interface ListPostsOptions {
  limit?: number;         // Number of posts per page (default: 20)
  cursor?: string;        // created_at of last post for cursor pagination
  userId?: string;        // Filter by user ID (for profile pages)
}

/**
 * Response from paginated post listing
 */
export interface ListPostsResult {
  posts: DbPost[];
  nextCursor: string | null;  // null means no more posts
  hasMore: boolean;
}

/**
 * List posts from Supabase database with cursor-based pagination
 * Supports infinite scroll with efficient database queries
 */
export async function listPostsFromDb(options?: ListPostsOptions): Promise<ListPostsResult> {
  if (!supabase) {
    console.error("[listPostsFromDb] Supabase is not configured");
    throw new Error("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file");
  }

  const limit = options?.limit ?? 20;

  console.log(`[listPostsFromDb] Fetching posts (limit: ${limit}, cursor: ${options?.cursor || 'none'})`);

  // Build query - include guest data for admin visibility
  let query = supabase
    .from("posts")
    .select(`
      id,slug,title,type,content,text_align,attachments,gif_url,author_name,author_email,author_avatar,user_id,guest_id,view_count,created_at,draft,hidden,is_pinned,thread_id,thread_position,music_metadata,
      guests:guest_id (anonymous_id)
    `)
    .or("hidden.is.null,hidden.eq.false")
    .order("created_at", { ascending: false })
    .limit(limit + 1); // Fetch one extra to check if more exist

  // Filter by user if specified
  if (options?.userId) {
    query = query.eq("user_id", options.userId);
  }

  // Apply cursor for pagination (skip posts we've already seen)
  if (options?.cursor) {
    query = query.lt("created_at", options.cursor);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[listPostsFromDb] Error fetching posts:", error);
    throw error;
  }

  // Check if there are more posts
  const hasMore = (data?.length || 0) > limit;
  let posts = hasMore ? (data || []).slice(0, limit) : (data || []);

  // Filter to only show first post of threads or standalone posts
  posts = posts.filter(
    (p) => p.thread_position === null || p.thread_position === undefined || p.thread_position === 1
  );

  // Get next cursor from last post's created_at
  const nextCursor = hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null;

  console.log(`[listPostsFromDb] Fetched ${posts.length} posts, hasMore: ${hasMore}`);

  // DEBUG: Log first anonymous post's guest data
  const anonPosts = posts.filter((p: any) => !p.user_id);
  if (anonPosts.length > 0) {
    console.log('[listPostsFromDb] DEBUG - First anonymous post:', {
      id: anonPosts[0].id,
      title: anonPosts[0].title,
      user_id: anonPosts[0].user_id,
      guest_id: anonPosts[0].guest_id,
      guests: anonPosts[0].guests,
      author_name: anonPosts[0].author_name
    });
  }

  // Normalize attachments and extract guest anonymous_id
  const normalizedPosts = posts.map(
    (p: any) =>
      ({
        ...p,
        attachments: normalizeAttachments(p.attachments),
        // Extract anonymous_id from the joined guests relation
        anonymous_id: p.guests?.anonymous_id || null,
      }) as DbPost,
  );

  return { posts: normalizedPosts, nextCursor, hasMore };
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
    author_name: user?.username || null,
    author_email: user?.email || null,
    author_avatar: user?.avatarDataUrl || null,
  } satisfies DbPost;
}
