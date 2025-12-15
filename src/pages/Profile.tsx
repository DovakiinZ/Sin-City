import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import AvatarUploader from "@/components/AvatarUploader";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Shield, Phone, Twitter, Instagram, ImagePlus } from "lucide-react";

export default function Profile() {
  const { user, updateProfile, logout, updatePassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
<<<<<<< HEAD
  // Removed displayName state
=======
  // const [displayName, setDisplayName] = useState(user?.displayName || ""); // Deprecated, removing to fix lint
  const [username, setUsername] = useState(user?.username || user?.displayName || "");
>>>>>>> 1fb12862d45718769639b4d7937d0ae07dedf6e5
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatarDataUrl);
  const [loadingAvatar, setLoadingAvatar] = useState(true);
  const [bio, setBio] = useState("");

  // Social media state
  const [twitterUsername, setTwitterUsername] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [headerUrl, setHeaderUrl] = useState<string | undefined>(undefined);
  const [uploadingHeader, setUploadingHeader] = useState(false);

  // Username change state
  // const [username, setUsername] = useState(""); <-- Duplicate removed
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
          .select("*")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          console.log("[Profile] Loaded data:", data);
          // Set all values, even if empty
          setAvatar(data.avatar_url || undefined);
          if (data.phone) setPhone(data.phone);
          if (data.mfa_enabled) setMfaEnabled(data.mfa_enabled);
          setBio(data.bio || "");
          if (data.username) {
            setUsername(data.username);
            setOriginalUsername(data.username);
          } else if (data.display_name) {
            // Fallback if no username set in profile
            setUsername(data.display_name);
            setOriginalUsername(data.display_name);
          }
          setUsernameChangesThisYear(data.username_changes_this_year || 0);
          if (data.username_changed_at) setUsernameChangedAt(data.username_changed_at);
          setTwitterUsername(data.twitter_username || "");
          setInstagramUsername(data.instagram_username || "");
<<<<<<< HEAD
=======
          // setDisplayName(data.display_name || ""); // Deprecated
>>>>>>> 1fb12862d45718769639b4d7937d0ae07dedf6e5
          setHeaderUrl(data.header_url || undefined);
        } else if (error) {
          console.error("[Profile] Error fetching profile:", error);
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
<<<<<<< HEAD
      // Save avatar to auth metadata (only avatar, username is handled separately or via implicit sync potentially, but let's be explicit if needed)
      // Actually we are not updating username here, only avatar.
      await updateProfile({ avatarDataUrl: avatar });
=======
      // Update auth metadata with username as displayName for compatibility
      await updateProfile({ displayName: username, avatarDataUrl: avatar });
>>>>>>> 1fb12862d45718769639b4d7937d0ae07dedf6e5

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
<<<<<<< HEAD
              // Removed display_name
=======
              display_name: username || null, // Sync display_name to username
              username: username || null,
>>>>>>> 1fb12862d45718769639b4d7937d0ae07dedf6e5
              twitter_username: twitterUsername || null,
              instagram_username: instagramUsername || null,
              header_url: headerUrl || null,
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

      // Update AuthContext and metadata with new username
      await updateProfile({ username });

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
<<<<<<< HEAD
          <div className="ascii-dim text-xs">Username: @{user.username}</div>

=======
          {/* Display Name field removed in favor of Username below */}
>>>>>>> 1fb12862d45718769639b4d7937d0ae07dedf6e5
          <div>
            <div className="ascii-dim text-xs mb-1">Profile picture</div>
            <AvatarUploader value={avatar} onChange={setAvatar} />
          </div>
          <div>
            <div className="ascii-dim text-xs mb-1">Profile Header Banner</div>
            {headerUrl ? (
              <div className="relative">
                <img src={headerUrl} alt="Header" className="w-full h-24 object-cover border border-green-700 rounded" />
                <button
                  type="button"
                  onClick={() => setHeaderUrl(undefined)}
                  className="absolute top-1 right-1 bg-black/70 text-red-400 px-2 py-1 text-xs border border-red-700 hover:bg-red-900/30"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-24 border border-green-700 border-dashed cursor-pointer hover:bg-green-900/10">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingHeader}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !user?.id) return;
                    setUploadingHeader(true);
                    try {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `${Date.now()}.${fileExt}`;
                      const filePath = `headers/${user.id}/${fileName}`;
                      const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file);
                      if (uploadError) throw uploadError;
                      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
                      setHeaderUrl(publicUrl);
                    } catch (err) {
                      console.error('Header upload error:', err);
                    } finally {
                      setUploadingHeader(false);
                    }
                  }}
                />
                <ImagePlus className="w-6 h-6 text-green-600 mb-1" />
                <span className="text-xs text-green-600">{uploadingHeader ? 'Uploading...' : 'Click to upload header'}</span>
              </label>
            )}
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

          {/* Social Media Links */}
          <div className="space-y-3 pt-2">
            <div className="ascii-dim text-xs">Social Media Links</div>
            <label className="flex items-center gap-2">
              <Twitter className="w-4 h-4 text-blue-400" />
              <input
                value={twitterUsername}
                onChange={(e) => setTwitterUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                className="flex-1 bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                placeholder="Twitter/X username"
                maxLength={15}
              />
            </label>
            <label className="flex items-center gap-2">
              <Instagram className="w-4 h-4 text-pink-400" />
              <input
                value={instagramUsername}
                onChange={(e) => setInstagramUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
                className="flex-1 bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                placeholder="Instagram username"
                maxLength={30}
              />
            </label>
          </div>
        </div>

        {/* Username Change Section - moved up to be main identity */}
        <div className="border-t border-green-700 pt-4">
          <div className="ascii-highlight text-lg mb-3">+-- Identity --+</div>
          <div className="space-y-3">
            <div className="ascii-dim text-xs mb-2">
              Current: @{originalUsername || "not set"} • {getRemainingChanges()} changes remaining this year
            </div>
            <label className="block">
              <div className="ascii-dim text-xs mb-1">Username</div>
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
              {changingUsername ? "Updating..." : "Update Username"}
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

        {/* Save & Logout */}
        <div className="border-t border-green-700 pt-4 flex gap-3">
          <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-4 py-2" onClick={save}>Save Profile</button>
          <button className="ascii-dim border border-green-700 px-4 py-2 hover:text-red-400 hover:border-red-600" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
