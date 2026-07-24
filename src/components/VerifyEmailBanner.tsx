// src/components/VerifyEmailBanner.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVerification } from '@/hooks/useVerification';

function fmt(ms: number) {
  if (ms <= 0) return '0h 0m';
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${m}m`;
}
export default function VerifyEmailBanner() {
  const { verifiedAt, deadline, loading } = useVerification();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (loading || verifiedAt || !deadline) return null;
  const remaining = Date.parse(deadline) - now, overdue = remaining <= 0;
  return (
    <div className="w-full bg-black border-b border-green-700 text-green-400 font-mono text-sm px-4 py-2 flex items-center justify-between gap-3">
      <span>{overdue ? 'Your account is restricted until you verify.' : `Verify within ${fmt(remaining)} or your account will be restricted.`}</span>
      <Link to="/verify" className="border border-green-700 px-3 py-1 whitespace-nowrap">Verify now</Link>
    </div>
  );
}
