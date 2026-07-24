// api/verify-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification, hashOtp } from './lib/verification-db';
import { otpAttemptsExceeded } from './lib/verification-state';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
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
