// lib/notification-email.ts — pure email rendering for activity notifications.
export type EmailNotification = {
  type: string;
  content: Record<string, unknown>;
  created_at: string;
};

export interface RenderOptions {
  appUrl: string;
  unsubscribeUrl: string;
}

type Group = { key: string; label: (n: number, names: string[]) => string };

// Map notification types onto display groups. Order defines line order.
const GROUPS: { types: string[]; def: Group }[] = [
  { types: ['dm_message', 'dm', 'message'], def: { key: 'dm',
      label: (n, names) => `💬 ${n} new ${n === 1 ? 'message' : 'messages'}${names.length ? ' from ' + names.join(', ') : ''}` } },
  { types: ['reaction', 'like'], def: { key: 'like',
      label: (n) => `👍 ${n} ${n === 1 ? 'like' : 'likes'} on your posts` } },
  { types: ['comment', 'reply'], def: { key: 'comment',
      label: (n) => `💬 ${n} new ${n === 1 ? 'comment' : 'comments'}` } },
  { types: ['follow_request', 'follow_approved', 'follow'], def: { key: 'follow',
      label: (n) => `👥 ${n} follow ${n === 1 ? 'update' : 'updates'}` } },
  { types: ['mention'], def: { key: 'mention',
      label: (n) => `📣 ${n} ${n === 1 ? 'mention' : 'mentions'}` } },
];

function nameOf(n: EmailNotification): string | null {
  const c = n.content || {};
  return (c.senderUsername as string) || (c.requester as string) || (c.author as string) || null;
}

export function summarizeActivity(notes: EmailNotification[]): { total: number; lines: string[] } {
  const lines: string[] = [];
  for (const { types, def } of GROUPS) {
    const inGroup = notes.filter((n) => types.includes(n.type));
    if (inGroup.length === 0) continue;
    const names = Array.from(new Set(inGroup.map(nameOf).filter((x): x is string => !!x))).slice(0, 3);
    lines.push(def.label(inGroup.length, names));
  }
  return { total: notes.length, lines };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderActivityEmail(
  notes: EmailNotification[],
  opts: RenderOptions,
): { subject: string; html: string } {
  const { total, lines } = summarizeActivity(notes);

  let subject: string;
  if (total === 1) {
    const only = lines[0] ? lines[0].replace(/^[^\w]+/, '') : 'new activity';
    // For a single item, prefer a concrete subject.
    const single = notes[0];
    if (['dm_message', 'dm', 'message'].includes(single.type)) subject = 'New message on Sin City';
    else if (['reaction', 'like'].includes(single.type)) subject = 'Someone liked your post on Sin City';
    else if (['comment', 'reply'].includes(single.type)) subject = 'New comment on Sin City';
    else if (single.type === 'mention') subject = 'You were mentioned on Sin City';
    else if (single.type.startsWith('follow')) subject = 'New follow activity on Sin City';
    else subject = `1 new notification on Sin City (${esc(only)})`;
  } else {
    subject = `You have ${total} new notifications on Sin City`;
  }

  const items = lines.map((l) => `<li style="margin:8px 0;">${esc(l)}</li>`).join('');
  const html = `
  <div style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:40px;max-width:520px;margin:0 auto;">
    <h1 style="border-bottom:1px solid #22c55e;padding-bottom:16px;">Sin City</h1>
    <p>You have new activity while you were away:</p>
    <ul style="list-style:none;padding:0;">${items}</ul>
    <p style="margin-top:24px;">
      <a href="${esc(opts.appUrl)}" style="color:#22c55e;">Open Sin City &rarr;</a>
    </p>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #333;font-size:12px;color:#666;">
      Sin City ·
      <a href="${esc(opts.unsubscribeUrl)}" style="color:#888;">Unsubscribe from activity emails</a>
    </div>
  </div>`;

  return { subject, html };
}
