// api/confirm-phone.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification } from './lib/verification-db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
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
