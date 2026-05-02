import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import BackButton from "@/components/BackButton";
import ImageCropperModal from "@/components/ImageCropperModal";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Camera, ImagePlus, Save, X, Check } from "lucide-react";

import { useLogger } from "@/hooks/useLogger";
import { loginWithSpotify, handleSpotifyCallback, disconnectSpotify } from "@/lib/spotify";

export default function ProfileEdit() {
    const { user, updateProfile } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    // Profile state
    const [username, setUsername] = useState("");
    const [originalUsername, setOriginalUsername] = useState("");
    const [avatar, setAvatar] = useState<string | undefined>(undefined);
    const [bio, setBio] = useState("");
    const [headerUrl, setHeaderUrl] = useState<string | undefined>(undefined);
    const [twitterUsername, setTwitterUsername] = useState("");
    const [instagramUsername, setInstagramUsername] = useState("");
    const [discordUsername, setDiscordUsername] = useState("");
    const [discordId, setDiscordId] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Initialize secure logger
    const logger = useLogger(isAdmin);

    // Username change tracking
    const [usernameChangesThisYear, setUsernameChangesThisYear] = useState(0);

    // Image cropper state
    const [pendingImage, setPendingImage] = useState<string | null>(null);
    const [cropperMode, setCropperMode] = useState<"avatar" | "header" | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingHeader, setUploadingHeader] = useState(false);

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const headerInputRef = useRef<HTMLInputElement>(null);

    // Load profile data
    useEffect(() => {
        async function loadProfile() {
            if (!user?.id) {
                setLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("id", user.id)
                    .single();

                if (!error && data) {
                    setUsername(data.username || "");
                    setOriginalUsername(data.username || "");
                    setAvatar(data.avatar_url || undefined);
                    setBio(data.bio || "");
                    setHeaderUrl(data.header_url || undefined);
                    setTwitterUsername(data.twitter_username || "");
                    setInstagramUsername(data.instagram_username || "");
                    setDiscordUsername(data.discord_username || "");
                    setDiscordId(data.discord_id || "");
                    setIsAdmin(data.role === 'admin');
                    setUsernameChangesThisYear(data.username_changes_this_year || 0);
                }
            } catch (err) {
                console.error("Error loading profile:", err);
            } finally {
                setLoading(false);
            }
        }

        loadProfile();
    }, [user?.id]);

    // Handle Spotify OAuth Callback
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
            handleSpotifyCallback(code)
                .then(() => {
                    toast({ title: "Spotify Connected", description: "Successfully linked Spotify account" });
                    // Remove code from URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                })
                .catch(err => {
                    console.error("Spotify Auth Error", err);
                    toast({ title: "Spotify Error", description: err.message, variant: "destructive" });
                });
        }
    }, []);

    // Handle avatar file selection
    function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // For GIFs (admin only), upload directly
        if (file.type === 'image/gif' && isAdmin) {
            uploadAvatar(file);
            return;
        }

        // Use URL.createObjectURL for immediate preview
        const objectUrl = URL.createObjectURL(file);
        setPendingImage(objectUrl);
        setCropperMode("avatar");
    }

    // Handle header file selection
    function handleHeaderSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // For GIFs (admin only), upload directly
        if (file.type === 'image/gif' && isAdmin) {
            uploadHeader(file);
            return;
        }

        // Use URL.createObjectURL for immediate preview
        const objectUrl = URL.createObjectURL(file);
        setPendingImage(objectUrl);
        setCropperMode("header");
    }

    // Upload avatar
    async function uploadAvatar(file: File | Blob) {
        if (!user?.id) return;
        setUploadingAvatar(true);

        try {
            const isBlob = file instanceof Blob && !(file instanceof File);
            const fileExt = isBlob ? 'jpg' : (file as File).name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `avatars/${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('media')
                .upload(filePath, file, { contentType: isBlob ? 'image/jpeg' : undefined });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
            setAvatar(publicUrl);
            toast({ title: "Uploaded", description: "Avatar updated" });
        } catch (err) {
            console.error('Avatar upload error:', err);
            toast({ title: "Error", description: "Failed to upload avatar", variant: "destructive" });
        } finally {
            setUploadingAvatar(false);
            setCropperMode(null);
            setPendingImage(null);
        }
    }

    // Upload header
    async function uploadHeader(file: File | Blob) {
        if (!user?.id) return;
        setUploadingHeader(true);

        try {
            const isBlob = file instanceof Blob && !(file instanceof File);
            const fileExt = isBlob ? 'jpg' : (file as File).name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `headers/${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('media')
                .upload(filePath, file, { contentType: isBlob ? 'image/jpeg' : undefined });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
            setHeaderUrl(publicUrl);
            toast({ title: "Uploaded", description: "Header updated" });
        } catch (err) {
            console.error('Header upload error:', err);
            toast({ title: "Error", description: "Failed to upload header", variant: "destructive" });
        } finally {
            setUploadingHeader(false);
            setCropperMode(null);
            setPendingImage(null);
        }
    }

    // Handle cropped image
    function handleCroppedImage(blob: Blob) {
        if (cropperMode === "avatar") {
            uploadAvatar(blob);
        } else if (cropperMode === "header") {
            uploadHeader(blob);
        }
    }

    // Save all changes
    async function handleSave() {
        if (!user?.id) return;
        setSaving(true);

        try {
            // Check if username changed
            if (username !== originalUsername) {
                if (usernameChangesThisYear >= 2) {
                    toast({ title: "Error", description: "You can only change username twice per year", variant: "destructive" });
                    setSaving(false);
                    return;
                }

                // Check if username is taken
                const { data: existing } = await supabase
                    .from("profiles")
                    .select("id")
                    .ilike("username", username)
                    .neq("id", user.id)
                    .single();

                if (existing) {
                    toast({ title: "Error", description: "Username is already taken", variant: "destructive" });
                    setSaving(false);
                    return;
                }
            }

            const updateData: any = {
                bio: bio || null,
                avatar_url: avatar || null,
                header_url: headerUrl || null,
                twitter_username: twitterUsername || null,
                instagram_username: instagramUsername || null,
                discord_username: discordUsername || null,
                discord_id: discordId || null,
            };

            // Add username change if changed
            if (username !== originalUsername) {
                updateData.username = username;
                updateData.username_changed_at = new Date().toISOString();
                updateData.username_changes_this_year = usernameChangesThisYear + 1;
            }

            const { error } = await supabase
                .from("profiles")
                .update(updateData)
                .eq("id", user.id);

            if (error) throw error;

            // Update auth context
            await updateProfile({
                username: username,
                avatarDataUrl: avatar
            });

            toast({ title: "Saved", description: "Profile updated successfully" });
            navigate("/profile");
        } catch (err: any) {
            logger.error("Save error:", err);
            toast({
                title: "Error",
                description: `Failed to save profile: ${err.message || "Unknown error"}`,
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-400 mb-4">You are not logged in</p>
                    <Link to="/login" className="text-green-400 hover:underline">
                        Sign in
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-2xl mx-auto px-4 py-4">
                {/* Top Bar */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <h1 className="text-lg font-medium text-green-400">Edit Profile</h1>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-black font-medium rounded-lg disabled:opacity-50"
                    >
                        <Check className="w-4 h-4" />
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>

                {/* Header Image */}
                <div className="mb-6">
                    <label className="text-sm text-gray-500 mb-2 block">Header Banner</label>
                    <div
                        className="relative h-32 bg-gradient-to-br from-green-900/30 to-black rounded-lg overflow-hidden cursor-pointer group"
                        onClick={() => headerInputRef.current?.click()}
                    >
                        {headerUrl ? (
                            <img src={headerUrl} alt="Header" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <ImagePlus className="w-8 h-8 text-gray-600" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <Camera className="w-6 h-6 text-white" />
                        </div>
                        {uploadingHeader && (
                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-none">
                                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <input
                        ref={headerInputRef}
                        type="file"
                        accept={isAdmin ? "image/*" : "image/png,image/jpeg,image/jpg,image/webp,image/heic"}
                        className="hidden"
                        onChange={handleHeaderSelect}
                    />
                </div>

                {/* Avatar */}
                <div className="mb-6">
                    <label className="text-sm text-gray-500 mb-2 block">Profile Picture</label>
                    <div
                        className="relative w-24 h-24 rounded-full bg-green-900/30 overflow-hidden cursor-pointer group border-2 border-green-700/50"
                        onClick={() => avatarInputRef.current?.click()}
                    >
                        {avatar ? (
                            <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Camera className="w-6 h-6 text-gray-600" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <Camera className="w-5 h-5 text-white" />
                        </div>
                        {uploadingAvatar && (
                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-none">
                                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept={isAdmin ? "image/*" : "image/png,image/jpeg,image/jpg,image/webp,image/heic"}
                        className="hidden"
                        onChange={handleAvatarSelect}
                    />
                </div>

                {/* Username */}
                <div className="mb-6">
                    <label className="text-sm text-gray-500 mb-2 block">
                        Username
                        <span className="text-xs text-gray-600 ml-2">
                            ({2 - usernameChangesThisYear} changes left this year)
                        </span>
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-green-400">@</span>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            className="flex-1 bg-black/50 border border-green-700/50 rounded-lg px-3 py-2 text-green-100 focus:border-green-500 focus:outline-none"
                            placeholder="username"
                        />
                    </div>
                </div>

                {/* Bio */}
                <div className="mb-6">
                    <label className="text-sm text-gray-500 mb-2 block">Bio</label>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="w-full bg-black/50 border border-green-700/50 rounded-lg px-3 py-2 text-green-100 placeholder-gray-600 focus:border-green-500 focus:outline-none resize-none"
                        placeholder="Write something about yourself..."
                    />
                </div>

                {/* Social Links */}
                <div className="mb-6">
                    <label className="text-sm text-gray-500 mb-2 block">Social Links</label>
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-blue-400 w-20">Twitter</span>
                            <span className="text-gray-500">@</span>
                            <input
                                type="text"
                                value={twitterUsername}
                                onChange={(e) => setTwitterUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                className="flex-1 bg-black/50 border border-green-700/50 rounded-lg px-3 py-2 text-green-100 focus:border-green-500 focus:outline-none"
                                placeholder="username"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-pink-400 w-20">Instagram</span>
                            <span className="text-gray-500">@</span>
                            <input
                                type="text"
                                value={instagramUsername}
                                onChange={(e) => setInstagramUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
                                className="flex-1 bg-black/50 border border-green-700/50 rounded-lg px-3 py-2 text-green-100 focus:border-green-500 focus:outline-none"
                                placeholder="username"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-indigo-400 w-20">Discord</span>
                            <input
                                type="text"
                                value={discordUsername}
                                onChange={(e) => setDiscordUsername(e.target.value)}
                                className="flex-1 bg-black/50 border border-green-700/50 rounded-lg px-3 py-2 text-green-100 focus:border-green-500 focus:outline-none"
                                placeholder="username#1234"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className="text-indigo-400 w-20 text-xs">Discord ID</span>
                                <input
                                    type="text"
                                    value={discordId}
                                    onChange={(e) => setDiscordId(e.target.value.replace(/[^0-9]/g, ''))}
                                    className="flex-1 bg-black/50 border border-green-700/50 rounded-lg px-3 py-2 text-green-100 focus:border-green-500 focus:outline-none text-xs"
                                    placeholder="18-digit Discord ID (for Now Playing)"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 ml-22">
                                To show your Spotify/Game status, join the <a href="https://discord.gg/lanyard" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Lanyard Discord</a>. 
                                Find your ID by enabling Developer Mode in Discord and right-clicking your profile.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Spotify Official Integration */}
                <div className="mb-6">
                    <label className="text-sm text-gray-500 mb-2 block">Official Spotify Integration</label>
                    <div className="bg-black/50 border border-green-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-green-400">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                </svg>
                                <span className="font-medium text-sm">Spotify Currently Playing</span>
                            </div>
                            {localStorage.getItem('spotify_access_token') ? (
                                <button
                                    onClick={(e) => { e.preventDefault(); disconnectSpotify(); window.location.reload(); }}
                                    className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-700/50 rounded-lg text-xs hover:bg-red-900/50"
                                >
                                    Disconnect
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => { e.preventDefault(); loginWithSpotify(); }}
                                    className="px-3 py-1.5 bg-[#1DB954] text-black font-medium rounded-lg text-xs hover:bg-[#1ed760]"
                                >
                                    Connect Spotify
                                </button>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-400">
                            Connect your official Spotify account. Note: Your status will only update while you have a Sin City tab open.
                        </p>
                    </div>
                </div>

                {/* Cancel Button */}
                <button
                    onClick={() => navigate("/profile")}
                    className="w-full py-2 text-gray-500 hover:text-gray-400 text-sm"
                >
                    Cancel
                </button>
            </div>

            {/* Image Cropper Modal */}
            {pendingImage && cropperMode && (
                <ImageCropperModal
                    image={pendingImage}
                    aspectRatio={cropperMode === "avatar" ? 1 : 3}
                    onCropComplete={handleCroppedImage}
                    onCancel={() => {
                        setCropperMode(null);
                        setPendingImage(null);
                    }}
                />
            )}
        </div>
    );
}
