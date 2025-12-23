import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const { login, mfa } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Check if MFA is enabled for this user
      const { data: { user } } = await supabase.auth.getUser();
      const hasMfa = user?.factors?.some(f => f.status === 'verified');

      if (hasMfa) {
        setMfaRequired(true);
      } else {
        nav("/");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      if (!mfaRequired) setLoading(false); // keep loading if switching to MFA view? No, let user type
      else setLoading(false);
    }
  }

  async function onMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const factors = await mfa.listFactors();
      const totpFactor = factors.find(f => f.factor_type === 'totp' && f.status === 'verified');
      if (!totpFactor) throw new Error("No MFA factor found");

      const challenge = await mfa.challenge(totpFactor.id);
      await mfa.verifyChallenge(totpFactor.id, challenge.id, mfaCode);
      nav("/");
    } catch (err: any) {
      setError(err.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  if (mfaRequired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
          <div className="ascii-highlight mb-4 text-xl text-center">+-- 2FA Check --+</div>
          {error && <div className="text-red-400 mb-3 text-center">{error}</div>}
          <form onSubmit={onMfaSubmit} className="space-y-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-4">Enter the 6-digit code from your authenticator app.</p>
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-32 bg-black text-green-400 border border-green-700 px-2 py-2 outline-none text-center text-xl tracking-widest"
                required
                type="text"
                maxLength={6}
                autoFocus
              />
            </div>
            <button disabled={loading} className="w-full ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-2" type="submit">
              {loading ? "Verifying..." : "Verify Code"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
        <div className="mb-2"><BackButton /></div>
        <div className="ascii-highlight mb-4 text-xl">+-- Login --+</div>
        {error && <div className="text-red-400 mb-3">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Email or Username</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" required type="text" />
          </label>
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Password</div>
            <input value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" required type="password" />
          </label>
          <div className="text-right">
            <Link to="/forgot-password" className="ascii-dim text-xs hover:ascii-highlight">
              Forgot Password?
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={loading} className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" type="submit">
              {loading ? "Logging in..." : "Log in"}
            </button>
            <span className="ascii-dim text-xs">or</span>
            <Link to="/register" className="ascii-nav-link hover:ascii-highlight">Create an account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
