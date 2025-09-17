import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      nav("/");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
        <div className="mb-2"><BackButton /></div>
        <div className="ascii-highlight mb-4 text-xl">+-- Login --+</div>
        {error && <div className="text-red-400 mb-3">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Email</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" required type="email" />
          </label>
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Password</div>
            <input value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" required type="password" />
          </label>
          <div className="flex items-center gap-2">
            <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" type="submit">Log in</button>
            <span className="ascii-dim text-xs">or</span>
            <Link to="/register" className="ascii-nav-link hover:ascii-highlight">Create an account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
