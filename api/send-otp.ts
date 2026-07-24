// api/send-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification, logEvent, hashOtp } from './lib/verification-db';
import { canResendUser, generateOtp, OTP_TTL_MS } from './lib/verification-state';
import { sendOtpEmail } from './lib/verification-email';
import { getClientIP, hashIP } from './lib/ip-utils';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
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
