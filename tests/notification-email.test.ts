import { describe, it, expect } from 'vitest';
import { summarizeActivity, renderActivityEmail, type EmailNotification } from '../lib/notification-email';

const at = (type: string, content: Record<string, unknown> = {}): EmailNotification =>
  ({ type, content, created_at: '2026-08-13T00:00:00Z' });

const opts = { appUrl: 'https://cicada.city', unsubscribeUrl: 'https://cicada.city/api/notifications-cron?action=unsubscribe&token=tok' };

describe('summarizeActivity', () => {
  it('counts and groups across types', () => {
    const r = summarizeActivity([
      at('dm_message', { senderUsername: 'alice' }),
      at('dm_message', { senderUsername: 'bob' }),
      at('reaction'), at('reaction'), at('reaction'),
      at('comment', { postTitle: 'Hello' }),
      at('follow_request', { requester: 'carol' }),
      at('mention'),
    ]);
    expect(r.total).toBe(8);
    // one line per non-empty group: dm, like, comment, follow, mention
    expect(r.lines.length).toBe(5);
    expect(r.lines.some(l => l.includes('2') && /message/i.test(l))).toBe(true);
    expect(r.lines.some(l => l.includes('3') && /lik/i.test(l))).toBe(true);
  });

  it('ignores unknown types in the group lines but still counts total', () => {
    const r = summarizeActivity([at('reaction'), at('some_future_type')]);
    expect(r.total).toBe(2);
    expect(r.lines.length).toBe(1); // only the like group renders a line
  });
});

describe('renderActivityEmail', () => {
  it('subject reflects the total and html carries the unsubscribe url', () => {
    const notes = [at('reaction'), at('comment', { postTitle: 'X' })];
    const { subject, html } = renderActivityEmail(notes, opts);
    expect(subject).toMatch(/2/);
    expect(subject.toLowerCase()).toContain('notification');
    expect(html).toContain(opts.unsubscribeUrl);
    expect(html).toContain(opts.appUrl);
  });

  it('single notification gets a specific subject', () => {
    const { subject } = renderActivityEmail([at('dm_message', { senderUsername: 'alice' })], opts);
    expect(subject.toLowerCase()).toContain('message');
  });
});
