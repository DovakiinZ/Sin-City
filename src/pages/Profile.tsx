import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import AvatarUploader from "@/components/AvatarUploader";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user, updateProfile, logout, updatePassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatarDataUrl);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

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
    toast({
      title: "Success",
      description: "Profile updated successfully",
    });
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      await updatePassword(newPassword);
      toast({
        title: "Success",
        description: "Password updated successfully",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update password",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto font-mono border border-green-700 p-4 bg-black/70 space-y-6">
        <div className="mb-2"><BackButton /></div>
        <div className="ascii-highlight text-xl">+-- Profile --+</div>

        {/* Profile Information */}
        <div className="space-y-4">
          <div className="ascii-dim text-xs">Email: {user.email}</div>
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Display name</div>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none" />
          </label>
          <div>
            <div className="ascii-dim text-xs mb-1">Profile picture</div>
            <AvatarUploader value={avatar} onChange={setAvatar} />
          </div>
          <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" onClick={save}>Save Profile</button>
        </div>

        {/* Password Change Section */}
        <div className="border-t border-green-700 pt-4">
          <div className="ascii-highlight text-lg mb-3">+-- Change Password --+</div>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <label className="block">
              <div className="ascii-dim text-xs mb-1">New Password</div>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                type="password"
                minLength={6}
                disabled={changingPassword}
              />
            </label>
            <label className="block">
              <div className="ascii-dim text-xs mb-1">Confirm New Password</div>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                type="password"
                minLength={6}
                disabled={changingPassword}
              />
            </label>
            <button
              className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 disabled:opacity-50"
              type="submit"
              disabled={changingPassword || !newPassword || !confirmPassword}
            >
              {changingPassword ? "Updating..." : "Change Password"}
            </button>
          </form>
        </div>

        {/* Logout */}
        <div className="border-t border-green-700 pt-4">
          <button className="ascii-dim border border-green-700 px-3 py-1 hover:ascii-highlight" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
