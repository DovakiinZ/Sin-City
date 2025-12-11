import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import AvatarUploader from "@/components/AvatarUploader";
import BackButton from "@/components/BackButton";
import { Phone } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await register({
        email,
        password,
        displayName: displayName || email.split("@")[0],
        avatarDataUrl: avatar,
      });

      // Save phone number to profiles table if provided
      if (phone && user?.id) {
        await supabase
          .from("profiles")
          .update({ phone, mfa_enabled: true })
          .eq("id", user.id);
      }

      nav("/profile");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
    } finally {
      setLoading(false);
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
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" required type="email" disabled={loading} />
          </label>
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Password</div>
            <input value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" required type="password" disabled={loading} />
          </label>
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Display name</div>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" placeholder="How should we call you?" disabled={loading} />
          </label>
          <label className="block">
            <div className="ascii-dim text-xs mb-1 flex items-center gap-1">
              <Phone className="w-3 h-3" /> Phone Number <span className="text-green-600">(for 2FA)</span>
            </div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
              placeholder="+1234567890"
              type="tel"
              disabled={loading}
            />
          </label>
          <div>
            <div className="ascii-dim text-xs mb-1">Profile picture</div>
            <AvatarUploader value={avatar} onChange={setAvatar} />
          </div>
          <div className="flex gap-2">
            <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 disabled:opacity-50" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
