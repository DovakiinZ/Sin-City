// api/cron/enforce-email-verification.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, logEvent, hashOtp } from '../lib/verification-db';
import { dueReminderStage, stageBit, remainingMs, generateOtp, OTP_TTL_MS } from '../lib/verification-state';
import { sendReminderEmail } from '../lib/verification-email';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'unauthorized' });

  const sb = getServiceClient();
  const nowIso = new Date().toISOString();
  let reminded = 0, restricted = 0;

  // Pass 1: restriction (idempotent via status='active').
  const { data: toRestrict } = await sb.from('user_verification')
    .update({ account_status: 'verification_overdue', suspended_at: nowIso, suspension_reason: 'not_verified' })
    .lt('verification_deadline', nowIso).is('verified_at', null).eq('account_status', 'active')
    .select('user_id');
  for (const r of toRestrict || []) {
    await logEvent(r.user_id, 'VerificationDeadlineExpired', {});
    await logEvent(r.user_id, 'AccountRestricted', { reason: 'not_verified' });
    restricted++;
  }

  // Pass 2: reminders (email channel; still in grace, unverified).
  const { data: candidates } = await sb.from('user_verification')
    .select('*').is('verified_at', null).eq('account_status', 'active');
  for (const row of candidates || []) {
    const stage = dueReminderStage(row, nowIso);
    if (stage === 0 || !row.email) continue;
    const code = generateOtp();
    await sb.from('user_verification').update({
      reminders_sent: row.reminders_sent | stageBit(stage as 1 | 2 | 3),
      last_reminder_sent_at: nowIso,
      otp_hash: hashOtp(code), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0, otp_channel: 'email',
    }).eq('user_id', row.user_id);
    const hours = Math.max(0, remainingMs(nowIso, row.verification_deadline) / 3600_000);
    const err = await sendReminderEmail(row.email, code, stage, hours);
    if (!err) { await logEvent(row.user_id, 'VerificationReminderSent', { stage, channel: 'email' }); reminded++; }
  }
  return res.status(200).json({ reminded, restricted });
}
