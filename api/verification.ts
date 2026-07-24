// api/verification.ts — single Vercel function; dispatches on ?action= or body.action
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient, getVerification, updateVerification, logEvent, hashOtp } from '../lib/verification-db.js';
import { canResendUser, generateOtp, OTP_TTL_MS, otpAttemptsExceeded, dueReminderStage, stageBit, remainingMs, GRACE_MS } from '../lib/verification-state.js';
import { sendOtpEmail, sendReminderEmail } from '../lib/verification-email.js';
import { getClientIP, hashIP } from './lib/ip-utils.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anon = process.env.VITE_SUPABASE_ANON_KEY || '';

// ---- send-otp helpers ----
const IP_LIMIT = 10;
async function ipAllowed(ipHash: string): Promise<boolean> {
  const sb = getServiceClient();
  const { data } = await sb.from('verification_rate_limits').select('*').eq('ip_hash', ipHash).maybeSingle();
  const now = Date.now();
  if (!data || now - Date.parse(data.window_start) > 3600_000) {
    await sb.from('verification_rate_limits').upsert({ ip_hash: ipHash, window_start: new Date().toISOString(), count: 1 });
    return true;
  }
  if (data.count >= IP_LIMIT) return false;
  await sb.from('verification_rate_limits').update({ count: data.count + 1 }).eq('ip_hash', ipHash);
  return true;
}

// ---- change-email helpers ----
function validEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query.action as string | undefined) || req.body?.action;

  // ---- send-otp ----
  if (action === 'send-otp') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const generic = () => res.status(200).json({ ok: true });
    try {
      const channel = (req.body?.channel || 'email');
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return generic();
      const { data: { user } } = await getServiceClient().auth.getUser(token);
      if (!user) return generic();
      if (channel !== 'email') return generic(); // phone handled natively client-side

      const ipHash = hashIP(getClientIP(req).ip);
      if (!(await ipAllowed(ipHash))) return generic();

      const row = await getVerification(user.id);
      if (!row || row.verified_at || !user.email) return generic();

      const nowIso = new Date().toISOString();
      let sendCount = row.send_count;
      if (!row.send_window_start || Date.now() - Date.parse(row.send_window_start) > 86400_000) sendCount = 0;
      if (!canResendUser({ ...row, send_count: sendCount }, nowIso).ok) return generic();

      const code = generateOtp();
      await updateVerification(user.id, {
        otp_hash: hashOtp(code),
        otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        otp_attempts: 0,
        otp_channel: 'email',
        last_sent_at: nowIso,
        send_count: sendCount + 1,
        send_window_start: row.send_window_start && sendCount !== 0 ? row.send_window_start : nowIso,
        email: user.email,
      });
      const err = await sendOtpEmail(user.email, code);
      if (!err) await logEvent(user.id, 'VerificationOtpSent', { channel: 'email', ip_hash: ipHash });
      return generic();
    } catch (e) {
      console.error('[send-otp]', e);
      return res.status(200).json({ ok: true });
    }
  }

  // ---- verify-otp ----
  if (action === 'verify-otp') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const fail = () => res.status(200).json({ ok: true, verified: false });
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const code = String(req.body?.code || '');
      if (!token || !/^\d{6}$/.test(code)) return fail();
      const { data: { user } } = await getServiceClient().auth.getUser(token);
      if (!user) return fail();

      const row = await getVerification(user.id);
      if (!row) return fail();
      if (row.verified_at) return res.status(200).json({ ok: true, verified: true }); // idempotent
      if (otpAttemptsExceeded(row)) return fail();
      if (!row.otp_hash || !row.otp_expires_at || Date.parse(row.otp_expires_at) < Date.now()) return fail();

      if (hashOtp(code) !== row.otp_hash) {
        await updateVerification(user.id, { otp_attempts: row.otp_attempts + 1 });
        return fail();
      }
      // success — single use; restore trigger clears otp + restores status
      await updateVerification(user.id, { verified_at: new Date().toISOString(), verified_channel: 'email' });
      return res.status(200).json({ ok: true, verified: true });
    } catch (e) {
      console.error('[verify-otp]', e);
      return res.status(200).json({ ok: true, verified: false });
    }
  }

  // ---- confirm-phone ----
  if (action === 'confirm-phone') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const generic = () => res.status(200).json({ ok: true, verified: false });
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return generic();
      const sb = getServiceClient();
      const { data: { user } } = await sb.auth.getUser(token);
      if (!user) return generic();

      // Trusted read of confirmed phone (client cannot forge this).
      const { data: adminUser } = await sb.auth.admin.getUserById(user.id);
      const confirmed = adminUser?.user?.phone_confirmed_at;
      const phone = adminUser?.user?.phone;
      if (!confirmed || !phone) return generic();

      const row = await getVerification(user.id);
      if (!row) return generic();
      if (row.verified_at) return res.status(200).json({ ok: true, verified: true });

      await updateVerification(user.id, { verified_at: new Date().toISOString(), verified_channel: 'phone', phone });
      return res.status(200).json({ ok: true, verified: true });
    } catch (e) {
      console.error('[confirm-phone]', e);
      return res.status(200).json({ ok: true, verified: false });
    }
  }

  // ---- change-email ----
  if (action === 'change-email') {
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
      try {
        await updateVerification(user.id, patch);
        await logEvent(user.id, 'EmailChanged', { was_verified: wasVerified });
      } catch (inner) {
        // auth email already changed but verification-row reset failed — record for reconciliation
        try { await logEvent(user.id, 'EmailChanged', { was_verified: wasVerified, partial: true }); } catch { /* best effort */ }
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[change-email]', e);
      return res.status(200).json({ ok: true });
    }
  }

  // ---- admin-list ----
  if (action === 'admin-list') {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const svc = getServiceClient();
      const { data: { user } } = await svc.auth.getUser(token);
      if (!user) return res.status(403).json({ error: 'forbidden' });
      const { data: prof } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

      const { data: rows } = await svc.from('user_verification')
        .select('user_id, email, phone, account_status, verification_deadline, verified_at, verified_channel, reminders_sent, last_reminder_sent_at, suspended_at, suspension_reason')
        .order('verification_deadline', { ascending: true }).limit(500);
      return res.status(200).json({ rows: rows || [] });
    } catch (e) {
      console.error('[admin-list]', e);
      return res.status(500).json({ error: 'internal error' });
    }
  }

  // ---- admin-verify ----
  if (action === 'admin-verify') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const svc = getServiceClient();
      const { data: { user } } = await svc.auth.getUser(token);
      if (!user) return res.status(403).json({ error: 'forbidden' });
      const { data: prof } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

      const { target, reason } = req.body || {};
      if (!target) return res.status(400).json({ error: 'bad request' });
      const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const { error } = await userClient.rpc('admin_verify_user', { target, reason: reason || '' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[admin-verify]', e);
      return res.status(500).json({ error: 'internal error' });
    }
  }

  // ---- admin-restore ----
  if (action === 'admin-restore') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const svc = getServiceClient();
      const { data: { user } } = await svc.auth.getUser(token);
      if (!user) return res.status(403).json({ error: 'forbidden' });
      const { data: prof } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

      const { target, reason } = req.body || {};
      if (!target) return res.status(400).json({ error: 'bad request' });
      const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const { error } = await userClient.rpc('admin_restore_user', { target, reason: reason || '' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[admin-restore]', e);
      return res.status(500).json({ error: 'internal error' });
    }
  }

  // ---- cron ----
  if (action === 'cron') {
    if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`)
      return res.status(401).json({ error: 'unauthorized' });

    try {
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
        const hours = Math.max(0, remainingMs(nowIso, row.verification_deadline) / 3600_000);
        const err = await sendReminderEmail(row.email, code, stage, hours);
        if (!err) {
          await sb.from('user_verification').update({
            reminders_sent: row.reminders_sent | stageBit(stage as 1 | 2 | 3),
            last_reminder_sent_at: nowIso,
            otp_hash: hashOtp(code), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
            otp_attempts: 0, otp_channel: 'email',
          }).eq('user_id', row.user_id);
          await logEvent(row.user_id, 'VerificationReminderSent', { stage, channel: 'email' });
          reminded++;
        }
      }
      return res.status(200).json({ reminded, restricted });
    } catch (e) {
      console.error('[cron]', e);
      return res.status(500).json({ error: 'internal error' });
    }
  }

  // ---- unknown action ----
  return res.status(400).json({ error: 'unknown action' });
}
