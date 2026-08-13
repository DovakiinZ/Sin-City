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

/**
 * Strip HTML tags from a string for plain text display
 */
/**
 * Build a feed excerpt that keeps <a> links intact while stripping every other tag.
 *
 * Anchors may be stored raw (the /create editor saves content verbatim) or
 * entity-escaped (the inline feed composer runs content through
 * parseInlineMarkdown first), so both forms are normalized before splitting.
 * The character budget counts visible text only, never markup.
 */
export function previewWithLinks(html: string, limit = 280): string {
  const withNewlines = html
    .replace(/<(br|p|div)[^>]*>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n');

  // Un-escape anchors that were escaped on save so they can be preserved below
  const normalized = withNewlines.replace(/&lt;a\b[\s\S]*?&lt;\/a&gt;/gi, (match) =>
    match
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
  );

  const parts = normalized.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi);

  let used = 0;
  let out = '';
  for (const part of parts) {
    if (!part || used >= limit) continue;

    const anchor = /^<a\b/i.test(part)
      ? part.match(/^(<a\b[^>]*>)([\s\S]*?)<\/a>$/i)
      : null;

    if (anchor) {
      const label = stripHtml(anchor[2]).slice(0, limit - used);
      if (!label) continue;
      out += `${anchor[1]}${label}</a>`;
      used += label.length;
    } else {
      // stripHtml trims, which would glue text onto an adjacent link — keep the
      // whitespace that separated this segment from its neighbours
      const lead = /^\s/.test(part) && out && !/\s$/.test(out) ? ' ' : '';
      const trail = /\s$/.test(part) ? ' ' : '';
      const stripped = stripHtml(part);
      const piece = (stripped ? lead + stripped + trail : lead || trail).slice(0, limit - used);
      out += piece;
      used += piece.length;
    }
  }

  return out;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&')  // Replace &amp; with &
    .replace(/&lt;/g, '<')   // Replace &lt; with <
    .replace(/&gt;/g, '>')   // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/[^\S\r\n]+/g, ' ') // Collapse horizontal spaces but preserve newlines
    .replace(/\n\s*\n/g, '\n')   // Collapse multiple newlines into a single one for preview
    .trim();
}

/**
 * Decode HTML entities for proper rendering
 */
export function decodeHtml(html: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  return textarea.value;
}
