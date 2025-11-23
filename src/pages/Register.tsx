import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import AvatarUploader from "@/components/AvatarUploader";
import BackButton from "@/components/BackButton";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await register({
        email,
        password,
        displayName: displayName || email.split("@")[0],
        avatarDataUrl: avatar,
      });
      nav("/profile");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
        <div className="mb-2"><BackButton /></div>
        <div className="ascii-highlight mb-4 text-xl">+-- Register --+</div>
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
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Display name</div>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" placeholder="How should we call you?" />
          </label>
          <div>
            <div className="ascii-dim text-xs mb-1">Profile picture</div>
            <AvatarUploader value={avatar} onChange={setAvatar} />
          </div>
          <div className="flex gap-2">
            <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" type="submit">Create account</button>
          </div>
        </form>
      </div>
    </div>
  );
}
