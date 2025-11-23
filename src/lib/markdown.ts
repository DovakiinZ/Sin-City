export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export type Heading = { depth: number; text: string; id: string };
export type PostFrontMatter = {
  title: string;
  date: string;
  author?: string;
  tags?: string[];
  draft: boolean;
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : null))
    .filter((item): item is string => Boolean(item && item.length > 0));
  return normalized.length > 0 ? normalized : undefined;
};

export function normalizeFrontMatter(data: Record<string, unknown>, fallbackTitle: string): PostFrontMatter {
  const rawTitle = typeof data.title === "string" ? data.title.trim() : "";
  const title = rawTitle.length > 0 ? rawTitle : fallbackTitle;
  const date = typeof data.date === "string" ? data.date : "";
  const author =
    typeof data.author === "string" && data.author.trim().length > 0 ? data.author.trim() : undefined;
  const tags = toStringArray(data.tags);

  const draft =
    typeof data.draft === "boolean"
      ? data.draft
      : typeof data.draft === "string"
        ? data.draft.toLowerCase() === "true"
        : false;

  return { title, date, author, tags, draft };
}

export function extractHeadings(md: string): Heading[] {
  const lines = md.split(/\r?\n/);
  const out: Heading[] = [];
  for (const line of lines) {
    const m = /^(#{2,4})\s+(.+)$/.exec(line.trim());
    if (m) {
      const depth = m[1].length; // 2..4
      const text = m[2].trim();
      out.push({ depth, text, id: slugify(text) });
    }
  }
  return out;
}

export function estimateReadTime(md: string, wpm = 200): number {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[#!>*_~`-]/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / wpm));
}
