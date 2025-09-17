import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AvatarUploader from "@/components/AvatarUploader";
import BackButton from "@/components/BackButton";

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatarDataUrl);

  if (!user) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-lg mx-auto font-mono border border-green-700 p-4 bg-black/70">
          <div className="ascii-highlight mb-2">+-- Profile --+</div>
          <div className="ascii-dim">You are not logged in.</div>
        </div>
      </div>
    );
  }

  function save() {
    updateProfile({ displayName, avatarDataUrl: avatar });
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto font-mono border border-green-700 p-4 bg-black/70 space-y-4">
        <div className="mb-2"><BackButton /></div>
        <div className="ascii-highlight text-xl">+-- Profile --+</div>
        <div className="ascii-dim text-xs">Email: {user.email}</div>
        <label className="block">
          <div className="ascii-dim text-xs mb-1">Display name</div>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" />
        </label>
        <div>
          <div className="ascii-dim text-xs mb-1">Profile picture</div>
          <AvatarUploader value={avatar} onChange={setAvatar} />
        </div>
        <div className="flex gap-2">
          <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" onClick={save}>Save</button>
          <button className="ascii-dim border border-green-700 px-3 py-1" onClick={logout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
