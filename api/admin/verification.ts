// api/admin/verification.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../lib/verification-db';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anon = process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return res.status(403).json({ error: 'forbidden' });
  const { data: prof } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const { data: rows } = await svc.from('user_verification')
      .select('user_id, email, phone, account_status, verification_deadline, verified_at, verified_channel, reminders_sent, last_reminder_sent_at, suspended_at, suspension_reason')
      .order('verification_deadline', { ascending: true }).limit(500);
    return res.status(200).json({ rows: rows || [] });
  }
  if (req.method === 'POST') {
    const { action, target, reason } = req.body || {};
    if (!['verify', 'restore'].includes(action) || !target) return res.status(400).json({ error: 'bad request' });
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const fn = action === 'verify' ? 'admin_verify_user' : 'admin_restore_user';
    const { error } = await userClient.rpc(fn, { target, reason: reason || '' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
