// src/hooks/useVerification.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Status = 'active' | 'verification_overdue' | 'suspended';
interface State { status: Status; deadline: string | null; verifiedAt: string | null; verifiedChannel: string | null; loading: boolean; }

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function useVerification() {
  const [s, setS] = useState<State>({ status: 'active', deadline: null, verifiedAt: null, verifiedChannel: null, loading: true });

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setS(v => ({ ...v, loading: false })); return; }
    const { data } = await supabase.from('user_verification')
      .select('account_status, verification_deadline, verified_at, verified_channel').eq('user_id', user.id).maybeSingle();
    setS({
      status: (data?.account_status as Status) ?? 'active',
      deadline: data?.verification_deadline ?? null,
      verifiedAt: data?.verified_at ?? null,
      verifiedChannel: data?.verified_channel ?? null,
      loading: false,
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const post = async (path: string, body?: unknown) =>
    (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: body ? JSON.stringify(body) : undefined })).json().catch(() => ({}));

  const sendEmailOtp = useCallback(() => post('/api/send-otp', { channel: 'email' }), []);
  const verifyEmailOtp = useCallback(async (code: string) => { const r = await post('/api/verify-otp', { code }); await refresh(); return !!r.verified; }, [refresh]);

  // Phone: Supabase native. Attach + send SMS, then verify, then confirm app-state.
  const startPhone = useCallback(async (phone: string) => { const { error } = await supabase.auth.updateUser({ phone }); if (error) throw error; }, []);
  const verifyPhoneOtp = useCallback(async (phone: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'phone_change' });
    if (error) throw error;
    const r = await post('/api/confirm-phone'); await refresh(); return !!r.verified;
  }, [refresh]);

  const changeEmail = useCallback(async (new_email: string) => { await post('/api/change-email', { new_email }); await refresh(); }, [refresh]);

  const remaining = s.deadline ? Date.parse(s.deadline) - Date.now() : 0;
  return { ...s, remainingMs: remaining, restricted: s.status !== 'active', sendEmailOtp, verifyEmailOtp, startPhone, verifyPhoneOtp, changeEmail, refresh };
}
