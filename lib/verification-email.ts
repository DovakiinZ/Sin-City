// api/lib/verification-email.ts
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Sin City <onboarding@resend.dev>';

export async function send(to: string, subject: string, html: string): Promise<string | null> {
  if (!RESEND_API_KEY) return 'RESEND_API_KEY not configured';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({}) as Record<string, unknown>); return `Resend error: ${(e as Record<string, unknown>).message || res.status}`; }
    return null;
  } catch (e: any) { return `Email send failed: ${e.message || 'unknown'}`; }
}
const codeBox = (code: string) => `
  <div style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:40px;max-width:520px;margin:0 auto;">
    <h1 style="border-bottom:1px solid #22c55e;padding-bottom:16px;">Sin City Verification</h1>
    <p>Your verification code:</p>
    <div style="background:#1a1a1a;border:2px solid #22c55e;padding:20px;text-align:center;margin:20px 0;">
      <span style="font-size:32px;letter-spacing:8px;font-weight:bold;">${code}</span></div>
    <p style="font-size:13px;color:#888;">Expires in 10 minutes.</p>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #333;font-size:12px;color:#666;">Sin City</div>
  </div>`;

export function sendOtpEmail(to: string, code: string) {
  return send(to, 'Your Sin City verification code', codeBox(code));
}
export function sendReminderEmail(to: string, code: string, stage: number, remainingHours: number) {
  return send(to, `Verify soon — ~${Math.max(0, Math.round(remainingHours))}h left`, codeBox(code));
}
