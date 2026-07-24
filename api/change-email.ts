// api/change-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification, logEvent } from './lib/verification-db';
import { GRACE_MS } from './lib/verification-state';

function validEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { new_email } = req.body || {};
    if (!token || !new_email || !validEmail(new_email)) return res.status(200).json({ ok: true });
    const sb = getServiceClient();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return res.status(200).json({ ok: true });

    const row = await getVerification(user.id);
    const wasVerified = !!row?.verified_at;
    await sb.auth.admin.updateUserById(user.id, { email: new_email });

    const patch: Record<string, unknown> = {
      email: new_email, verified_at: null, verified_channel: null,
      otp_hash: null, otp_expires_at: null, otp_attempts: 0, otp_channel: null,
    };
    if (wasVerified) {
      patch.verification_deadline = new Date(Date.now() + GRACE_MS).toISOString();
      patch.account_status = 'active'; patch.suspended_at = null; patch.suspension_reason = null;
      patch.reminders_sent = 0; patch.last_reminder_sent_at = null;
    }
    await updateVerification(user.id, patch);
    await logEvent(user.id, 'EmailChanged', { was_verified: wasVerified });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[change-email]', e);
    return res.status(200).json({ ok: true });
  }
}
