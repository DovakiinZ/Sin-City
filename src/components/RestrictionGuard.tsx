// src/components/RestrictionGuard.tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useVerification } from '@/hooks/useVerification';
const ALLOW = ['/verify', '/support', '/contact'];
export default function RestrictionGuard({ children }: { children: React.ReactNode }) {
  const { restricted, loading } = useVerification();
  const loc = useLocation();
  if (loading) return <>{children}</>;
  if (restricted && !ALLOW.some(p => loc.pathname.startsWith(p))) return <Navigate to="/verify" replace />;
  return <>{children}</>;
}
