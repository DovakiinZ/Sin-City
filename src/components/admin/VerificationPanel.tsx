// src/components/admin/VerificationPanel.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
interface Row { user_id: string; email: string; phone: string | null; account_status: string; verification_deadline: string; verified_at: string | null; verified_channel: string | null; reminders_sent: number; last_reminder_sent_at: string | null; suspended_at: string | null; suspension_reason: string | null; }
async function hdr() { const { data: { session } } = await supabase.auth.getSession(); return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }; }
const stages = (m: number) => [1, 2, 3].filter(i => m & (1 << (i - 1))).join(',') || '—';
export default function VerificationPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = async () => { const r = await fetch('/api/verification?action=admin-list', { headers: await hdr() }); const b = await r.json().catch(() => ({ rows: [] })); setRows(b.rows || []); };
  useEffect(() => { load(); }, []);
  const act = async (target: string, op: 'verify' | 'restore') => { const reason = window.prompt(`Reason for ${op}?`) || ''; await fetch('/api/verification', { method: 'POST', headers: await hdr(), body: JSON.stringify({ action: op === 'verify' ? 'admin-verify' : 'admin-restore', target, reason }) }); await load(); };
  const remind = async (target: string, email: string) => {
    if (!window.confirm(`Email a "log in to verify" reminder to ${email}?`)) return;
    const r = await fetch('/api/verification', { method: 'POST', headers: await hdr(), body: JSON.stringify({ action: 'admin-remind', target }) });
    const b = await r.json().catch(() => ({} as { ok?: boolean; skipped?: string; error?: string }));
    if (r.ok && b.ok && !b.skipped) window.alert(`Reminder sent to ${email}.`);
    else if (b.skipped) window.alert(`Not sent (${b.skipped.replace(/_/g, ' ')}).`);
    else window.alert(`Failed to send reminder${b.error ? `: ${b.error}` : ''}.`);
    await load();
  };
  return (
    <div className="font-mono text-green-400 text-xs overflow-x-auto">
      <table className="w-full border border-green-800">
        <thead><tr className="border-b border-green-800">
          <th className="text-left p-1">Email</th><th className="text-left p-1">Phone</th><th className="text-left p-1">Status</th>
          <th className="text-left p-1">Deadline</th><th className="text-left p-1">Verified</th><th className="text-left p-1">Reminders</th><th className="text-left p-1">Last reminder</th>
          <th className="text-left p-1">Suspended</th><th className="text-left p-1">Actions</th>
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.user_id} className="border-b border-green-900">
            <td className="p-1">{r.email}</td><td className="p-1">{r.phone ?? '—'}</td><td className="p-1">{r.account_status}</td>
            <td className="p-1">{new Date(r.verification_deadline).toLocaleString()}</td>
            <td className="p-1">{r.verified_at ? `✓ ${r.verified_channel ?? ''}` : '—'}</td>
            <td className="p-1">{stages(r.reminders_sent)}</td><td className="p-1">{r.last_reminder_sent_at ? new Date(r.last_reminder_sent_at).toLocaleString() : '—'}</td>
            <td className="p-1">{r.suspended_at ? (r.suspension_reason ?? 'yes') : '—'}</td>
            <td className="p-1"><button className="underline mr-2" onClick={() => act(r.user_id, 'verify')}>verify</button><button className="underline mr-2" onClick={() => act(r.user_id, 'restore')}>restore</button>{!r.verified_at && <button className="underline" onClick={() => remind(r.user_id, r.email)}>remind</button>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
