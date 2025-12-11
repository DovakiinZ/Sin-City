import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import AvatarUploader from "@/components/AvatarUploader";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Shield, Phone } from "lucide-react";

export default function Profile() {
  const { user, updateProfile, logout, updatePassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatarDataUrl);
  const [loadingAvatar, setLoadingAvatar] = useState(true);
  const [bio, setBio] = useState("");

  // Username change state
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [usernameChangesThisYear, setUsernameChangesThisYear] = useState(0);
  const [usernameChangedAt, setUsernameChangedAt] = useState<string | null>(null);
  const [changingUsername, setChangingUsername] = useState(false);

  // 2FA / Phone state
  const [phone, setPhone] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  // Load avatar and phone from Supabase profiles table on mount
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id || !supabase) {
        setLoadingAvatar(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("avatar_url, phone, mfa_enabled, bio, username, username_changes_this_year, username_changed_at")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          if (data.avatar_url) setAvatar(data.avatar_url);
          if (data.phone) setPhone(data.phone);
          if (data.mfa_enabled) setMfaEnabled(data.mfa_enabled);
          if (data.bio) setBio(data.bio);
          if (data.username) {
            setUsername(data.username);
            setOriginalUsername(data.username);
          }
          setUsernameChangesThisYear(data.username_changes_this_year || 0);
          if (data.username_changed_at) setUsernameChangedAt(data.username_changed_at);
        }
      } catch (err) {
        console.error("[Profile] Error loading profile:", err);
      } finally {
        setLoadingAvatar(false);
      }
    }

    loadProfile();
  }, [user?.id]);

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

  async function save() {
    try {
      // Save displayName to auth metadata
      await updateProfile({ displayName, avatarDataUrl: avatar });

      // Also save avatar to Supabase profiles table (more reliable than auth metadata)
      if (user?.id) {
        const { supabase } = await import("@/lib/supabase");
        if (supabase) {
          console.log("[Profile] Saving avatar to profiles table for user:", user.id);
          console.log("[Profile] Avatar length:", avatar?.length || 0);

          const { error } = await supabase
            .from("profiles")
            .upsert({
              id: user.id,
              avatar_url: avatar || null,
              bio: bio || null,
            }, { onConflict: 'id' });

          if (error) {
            console.error("[Profile] Error saving avatar:", error);
            toast({
              title: "Warning",
              description: `Profile saved but avatar may not have saved: ${error.message}`,
              variant: "destructive",
            });
            return;
          }
          console.log("[Profile] Avatar saved successfully!");
        }
      }

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error) {
      console.error("[Profile] Save error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save profile",
        variant: "destructive",
      });
    }
  }

  // Check if username can be changed (reset count if new year)
  const canChangeUsername = () => {
    if (usernameChangedAt) {
      const lastChange = new Date(usernameChangedAt);
      const now = new Date();
      // Reset count if it's a new year
      if (lastChange.getFullYear() < now.getFullYear()) {
        return true;
      }
    }
    return usernameChangesThisYear < 2;
  };

  const getRemainingChanges = () => {
    if (usernameChangedAt) {
      const lastChange = new Date(usernameChangedAt);
      const now = new Date();
      if (lastChange.getFullYear() < now.getFullYear()) {
        return 2;
      }
    }
    return 2 - usernameChangesThisYear;
  };

  async function handleChangeUsername() {
    if (!username.trim() || username === originalUsername) {
      toast({
        title: "Error",
        description: "Please enter a new username",
        variant: "destructive",
      });
      return;
    }

    if (username.length < 3 || username.length > 20) {
      toast({
        title: "Error",
        description: "Username must be 3-20 characters",
        variant: "destructive",
      });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      toast({
        title: "Error",
        description: "Username can only contain letters, numbers, and underscores",
        variant: "destructive",
      });
      return;
    }

    if (!canChangeUsername()) {
      toast({
        title: "Error",
        description: "You can only change your username twice per year",
        variant: "destructive",
      });
      return;
    }

    setChangingUsername(true);
    try {
      // Check if username is taken
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .neq("id", user?.id)
        .single();

      if (existing) {
        toast({
          title: "Error",
          description: "Username is already taken",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          username: username,
          username_changed_at: new Date().toISOString(),
          username_changes_this_year: usernameChangesThisYear + 1,
        })
        .eq("id", user?.id);

      if (error) throw error;

      setOriginalUsername(username);
      setUsernameChangesThisYear(prev => prev + 1);
      setUsernameChangedAt(new Date().toISOString());

      toast({
        title: "Success",
        description: `Username changed to @${username}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to change username",
        variant: "destructive",
      });
    } finally {
      setChangingUsername(false);
    }
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

  async function handleSavePhone() {
    if (!phone || phone.length < 10) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          phone: phone,
          mfa_enabled: true
        })
        .eq("id", user?.id);

      if (error) throw error;

      setMfaEnabled(true);
      toast({
        title: "2FA Enabled",
        description: "Your phone has been saved for secure verification",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save phone",
        variant: "destructive",
      });
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleDisable2FA() {
    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ mfa_enabled: false })
        .eq("id", user?.id);

      if (error) throw error;

      setMfaEnabled(false);
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to disable 2FA",
        variant: "destructive",
      });
    } finally {
      setSavingPhone(false);
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
          <label className="block">
            <div className="ascii-dim text-xs mb-1">Bio</div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none resize-none"
              placeholder="Tell us about yourself..."
              rows={3}
              maxLength={300}
            />
            <div className="ascii-dim text-xs text-right">{bio.length}/300</div>
          </label>
          <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" onClick={save}>Save Profile</button>
        </div>

        {/* Username Change Section */}
        <div className="border-t border-green-700 pt-4">
          <div className="ascii-highlight text-lg mb-3">+-- Change Username --+</div>
          <div className="space-y-3">
            <div className="ascii-dim text-xs mb-2">
              Current: @{originalUsername || "not set"} • {getRemainingChanges()} changes remaining this year
            </div>
            <label className="block">
              <div className="ascii-dim text-xs mb-1">New Username</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                placeholder="new_username"
                maxLength={20}
              />
              <div className="ascii-dim text-xs mt-1">3-20 characters, letters, numbers, underscores only</div>
            </label>
            <button
              onClick={handleChangeUsername}
              disabled={changingUsername || !canChangeUsername() || username === originalUsername}
              className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 disabled:opacity-50"
            >
              {changingUsername ? "Changing..." : "Change Username"}
            </button>
            {!canChangeUsername() && (
              <div className="text-red-400 text-xs">You've used all 2 username changes for this year</div>
            )}
          </div>
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

        {/* Two-Factor Authentication Section */}
        <div className="border-t border-green-700 pt-4">
          <div className="ascii-highlight text-lg mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            +-- Two-Factor Authentication --+
          </div>

          {mfaEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400">
                <Shield className="w-4 h-4" />
                <span>2FA is enabled</span>
              </div>
              <div className="ascii-dim text-xs">
                Phone: {phone}
              </div>
              <button
                className="ascii-dim border border-red-700 text-red-400 px-3 py-1 hover:bg-red-900/20 disabled:opacity-50"
                onClick={handleDisable2FA}
                disabled={savingPhone}
              >
                {savingPhone ? "Disabling..." : "Disable 2FA"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="ascii-dim text-xs">
                Add your phone number for secure login verification
              </div>
              <label className="block">
                <div className="ascii-dim text-xs mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone Number
                </div>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                  type="tel"
                  placeholder="+1234567890"
                  disabled={savingPhone}
                />
              </label>
              <button
                className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 disabled:opacity-50"
                onClick={handleSavePhone}
                disabled={savingPhone || !phone}
              >
                {savingPhone ? "Enabling..." : "Enable 2FA"}
              </button>
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="border-t border-green-700 pt-4">
          <button className="ascii-dim border border-green-700 px-3 py-1 hover:ascii-highlight" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
