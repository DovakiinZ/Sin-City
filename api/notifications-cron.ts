// api/notifications-cron.ts — sends coalesced activity emails; handles unsubscribe.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../lib/verification-db.js';
import { renderActivityEmail, type EmailNotification } from '../lib/notification-email.js';

const APP_URL = process.env.APP_URL || 'https://cicada.city';
const MAX_BATCH = 200;
const MAX_UNREAD = 50;
const STALE_HOURS = 6; // give up on an entry that keeps failing to send

function unsubscribeUrl(token: string): string {
  return `${APP_URL}/api/notifications-cron?action=unsubscribe&token=${encodeURIComponent(token)}`;
}

async function sendWithUnsub(to: string, subject: string, html: string, unsub: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) return 'RESEND_API_KEY not configured';
  const from = process.env.FROM_EMAIL || 'Sin City <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject, html,
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({} as Record<string, unknown>)); return `Resend error: ${(e as Record<string, unknown>).message || r.status}`; }
    return null;
  } catch (e: any) { return `Email send failed: ${e.message || 'unknown'}`; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string | undefined) || req.body?.action;

  // ---- unsubscribe (public, token-gated) ----
  if (action === 'unsubscribe') {
    const token = String(req.query.token || '');
    const page = (msg: string) =>
      res.status(200).setHeader('Content-Type', 'text/html').send(
        `<html><body style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:40px;text-align:center;">
           <h1>Sin City</h1><p>${msg}</p></body></html>`);
    if (!token) return page('Invalid unsubscribe link.');
    try {
      const sb = getServiceClient();
      const { data } = await sb.from('notification_email_settings')
        .update({ email_enabled: false, updated_at: new Date().toISOString() })
        .eq('unsubscribe_token', token).select('user_id');
      if (!data || data.length === 0) return page('This unsubscribe link is no longer valid.');
      return page('You have been unsubscribed from activity emails. You can re-enable them in Settings.');
    } catch (e) {
      console.error('[notifications-cron:unsubscribe]', e);
      return page('Something went wrong. Please try again later.');
    }
  }

  // ---- cron (Bearer CRON_SECRET) ----
  if (action === 'cron') {
    if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const sb = getServiceClient();
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      let sent = 0, skipped = 0, failed = 0;

      const { data: due } = await sb.from('notification_email_queue')
        .select('id, user_id, created_at')
        .eq('status', 'pending').lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true }).limit(MAX_BATCH);

      const markSent = (id: string) =>
        sb.from('notification_email_queue').update({ status: 'sent', sent_at: nowIso }).eq('id', id);
      const markCancelled = (id: string) =>
        sb.from('notification_email_queue').update({ status: 'cancelled' }).eq('id', id);

      for (const entry of due || []) {
        const { data: settings } = await sb.from('notification_email_settings')
          .select('email_enabled, unsubscribe_token').eq('user_id', entry.user_id).maybeSingle();

        if (settings && settings.email_enabled === false) { await markSent(entry.id); skipped++; continue; }

        const { data: unread } = await sb.from('notifications')
          .select('id, type, content, created_at')
          .eq('user_id', entry.user_id).eq('read', false).is('emailed_at', null)
          .order('created_at', { ascending: false }).limit(MAX_UNREAD);

        if (!unread || unread.length === 0) { await markSent(entry.id); skipped++; continue; }

        const { data: adminUser } = await sb.auth.admin.getUserById(entry.user_id);
        const email = adminUser?.user?.email;
        if (!email) { await markSent(entry.id); skipped++; continue; }

        const token = settings?.unsubscribe_token || '';
        if (!token) { await markSent(entry.id); skipped++; continue; }
        const { subject, html } = renderActivityEmail(unread as EmailNotification[], {
          appUrl: APP_URL, unsubscribeUrl: unsubscribeUrl(token),
        });

        const err = await sendWithUnsub(email, subject, html, unsubscribeUrl(token));
        if (err) {
          console.error('[notifications-cron] send failed:', err);
          const ageHours = (nowMs - Date.parse(entry.created_at)) / 3600_000;
          if (ageHours > STALE_HOURS) { await markCancelled(entry.id); }
          failed++;
          continue; // leave pending for retry (unless cancelled above)
        }
        const emailedIds = (unread as Array<{ id: string }>).map((u) => u.id);
        await sb.from('notifications').update({ emailed_at: nowIso }).in('id', emailedIds);
        await markSent(entry.id);
        sent++;
      }

      return res.status(200).json({ sent, skipped, failed });
    } catch (e) {
      console.error('[notifications-cron:cron]', e);
      return res.status(500).json({ error: 'internal error' });
    }
  }

  return res.status(400).json({ error: 'unknown action' });
}
