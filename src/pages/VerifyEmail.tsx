// src/pages/VerifyEmail.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVerification } from '@/hooks/useVerification';

export default function VerifyEmail() {
  const v = useVerification();
  const nav = useNavigate();
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [code, setCode] = useState(''); const [phone, setPhone] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown(c => c - 1), 1000); return () => clearInterval(t); }, [cooldown]);
  useEffect(() => { if (v.verifiedAt) nav('/'); }, [v.verifiedAt, nav]);

  const resendEmail = async () => { await v.sendEmailOtp(); setCooldown(60); setMsg('If eligible, a code was sent.'); };
  const submitEmail = async () => { setMsg(null); const ok = await v.verifyEmailOtp(code); setMsg(ok ? 'Verified!' : 'Invalid or expired code.'); };
  const sendPhone = async () => { setMsg(null); try { await v.startPhone(phone); setPhoneSent(true); setCooldown(60); setMsg('Code sent by SMS.'); } catch { setMsg('Could not send SMS.'); } };
  const submitPhone = async () => { setMsg(null); try { const ok = await v.verifyPhoneOtp(phone, code); setMsg(ok ? 'Verified!' : 'Invalid code.'); } catch { setMsg('Invalid code.'); } };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-mono text-green-400 p-4">
      <div className="border border-green-700 p-6 bg-black/70 max-w-md w-full">
        <div className="ascii-highlight mb-4 text-lg">+-- Verify your account --+</div>
        <div className="flex gap-2 mb-4">
          <button className={`border border-green-700 px-3 py-1 ${tab === 'email' ? 'bg-green-900/40' : ''}`} onClick={() => setTab('email')}>Email</button>
          <button className={`border border-green-700 px-3 py-1 ${tab === 'phone' ? 'bg-green-900/40' : ''}`} onClick={() => setTab('phone')}>Phone</button>
        </div>
        {tab === 'email' ? (
          <div className="space-y-3">
            <p className="text-xs ascii-dim">Enter the 6-digit code sent to your email.</p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="w-full bg-black border border-green-700 px-2 py-1 tracking-[8px] text-center" placeholder="000000" />
            <div className="flex gap-2">
              <button className="border border-green-700 px-3 py-1" onClick={submitEmail}>Verify</button>
              <button className="border border-green-700 px-3 py-1 disabled:opacity-50" disabled={cooldown > 0} onClick={resendEmail}>{cooldown > 0 ? `Resend (${cooldown}s)` : 'Send / resend code'}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs ascii-dim">Enter your phone in E.164 format (e.g. +15551234567).</p>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-black border border-green-700 px-2 py-1" placeholder="+15551234567" />
            {!phoneSent
              ? <button className="border border-green-700 px-3 py-1 disabled:opacity-50" disabled={cooldown > 0 || !phone} onClick={sendPhone}>{cooldown > 0 ? `Resend (${cooldown}s)` : 'Send SMS code'}</button>
              : <>
                  <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="w-full bg-black border border-green-700 px-2 py-1 tracking-[8px] text-center" placeholder="000000" />
                  <div className="flex gap-2">
                    <button className="border border-green-700 px-3 py-1" onClick={submitPhone}>Verify</button>
                    <button className="border border-green-700 px-3 py-1 disabled:opacity-50" disabled={cooldown > 0} onClick={sendPhone}>{cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend'}</button>
                  </div>
                </>}
          </div>
        )}
        {msg && <div className="mt-3 text-xs">{msg}</div>}
      </div>
    </div>
  );
}
