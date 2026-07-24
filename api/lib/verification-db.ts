// api/lib/verification-db.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function getServiceClient(): SupabaseClient {
  if (!url || !serviceKey) throw new Error('Supabase service config missing');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
export async function getVerification(userId: string) {
  const { data, error } = await getServiceClient().from('user_verification').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error; return data;
}
export async function updateVerification(userId: string, patch: Record<string, unknown>) {
  const { error } = await getServiceClient().from('user_verification').update(patch).eq('user_id', userId);
  if (error) throw error;
}
export async function logEvent(userId: string | null, type: string, metadata: Record<string, unknown> = {}) {
  await getServiceClient().from('verification_events').insert({ user_id: userId, event_type: type, metadata });
}
export async function launchDate(): Promise<string> {
  const envDate = process.env.EMAIL_VERIFICATION_LAUNCH_DATE;
  if (envDate) return new Date(envDate).toISOString();
  const { data } = await getServiceClient().from('verification_config').select('launch_date').eq('id', true).maybeSingle();
  return data?.launch_date ?? new Date().toISOString();
}
