import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/editor/RichTextEditor";
import ThreadCreator from "@/components/thread/ThreadCreator";
import { createThread } from "@/hooks/useSupabasePosts";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Image, Film, Loader2, Link2, Music, Smile, ChevronDown, ChevronUp, ArrowLeft, Save } from "lucide-react";
import GifPicker from "@/components/GifPicker";
import MusicEmbed from "@/components/MusicEmbed";
import { MusicMetadata } from "@/components/MusicCard";
import { useGuestFingerprint } from "@/hooks/useGuestFingerprint";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import EmailGateModal from "@/components/EmailGateModal";

type PostMode = "single" | "thread";

export default function CreatePost() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();

    // Mode toggle
    const initialMode = searchParams.get("mode") === "thread" ? "thread" : "single";
    const [mode, setMode] = useState<PostMode>(initialMode);

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);

    // Media state
    const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video' | 'music'; file?: File }[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [showMusicInput, setShowMusicInput] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [selectedGif, setSelectedGif] = useState<string | null>(null);
    const [mediaExpanded, setMediaExpanded] = useState(false);
    const [musicMetadata, setMusicMetadata] = useState<MusicMetadata | null>(null);
    const [fetchingMusicMetadata, setFetchingMusicMetadata] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Guest fingerprint
    const {
        fingerprint,
        guestId,
        createOrUpdateGuest,
        postCount: guestPostCount,
        guestData,
        refreshGuestData
    } = useGuestFingerprint();

    // Behavior tracking
    const { startTracking } = useBehaviorTracking();

    // Email gate
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [pendingEmail, setPendingEmail] = useState<string | null>(null);

    // Auto-expand media section when media is added
    useEffect(() => {
        if (mediaFiles.length > 0 || selectedGif) {
            setMediaExpanded(true);
        }
    }, [mediaFiles.length, selectedGif]);

    // Start behavior tracking for guests
    useEffect(() => {
        if (!user) startTracking();
    }, [user, startTracking]);

    const addMusic = async (url: string) => {
        // Validate URL first
        if (!url.includes('spotify.com') && !url.includes('youtube.com') && !url.includes('youtu.be') && !url.includes('music.apple.com') && !url.includes('music.youtube.com')) {
            toast({ title: "Invalid URL", description: "Use Spotify, Apple Music, or YouTube Music links", variant: "destructive" });
            return;
        }

        setFetchingMusicMetadata(true);

        // Helper to create basic metadata from URL when API is unavailable
        const createFallbackMetadata = (musicUrl: string): MusicMetadata => {
            let platform: 'spotify' | 'youtube' | 'apple' = 'youtube';
            let title = 'Music';

            if (musicUrl.includes('spotify.com')) {
                platform = 'spotify';
                title = 'Spotify Track';
            } else if (musicUrl.includes('music.apple.com')) {
                platform = 'apple';
                title = 'Apple Music Track';
            } else {
                platform = 'youtube';
                title = 'YouTube Music';
            }

            return {
                url: musicUrl,
                platform,
                title,
                artist: 'Tap to open',
                cover_image: '', // No cover on localhost fallback
            };
        };

        try {
            // Fetch metadata from API
            const response = await fetch('/api/music-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (response.ok) {
                const metadata: MusicMetadata = await response.json();
                setMusicMetadata(metadata);
                setMediaFiles(prev => [...prev, { url, type: 'music' }]);
                toast({ title: "Music added", description: `${metadata.title} - ${metadata.artist}` });
            } else {
                // Create fallback metadata when API fails
                const fallbackMeta = createFallbackMetadata(url);
                setMusicMetadata(fallbackMeta);
                setMediaFiles(prev => [...prev, { url, type: 'music' }]);
                toast({ title: "Music added", description: "Link ready to share" });
            }
        } catch (error) {
            // Create fallback metadata on network error (API only works on Vercel)
            const fallbackMeta = createFallbackMetadata(url);
            setMusicMetadata(fallbackMeta);
            setMediaFiles(prev => [...prev, { url, type: 'music' }]);
            toast({ title: "Music added", description: "Link ready to share" });
            console.error('Music metadata fetch error:', error);
        } finally {
            setFetchingMusicMetadata(false);
            setShowMusicInput(false);
        }
    };

    const handleEmailVerified = async (email: string) => {
        setShowEmailModal(false);
        await refreshGuestData();
        handleSave(false);
    };

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        if (mediaFiles.length + files.length > 4) {
            toast({ title: "Limit reached", description: "Max 4 files", variant: "destructive" });
            return;
        }

        // Store files locally with blob URLs for preview - upload happens during save
        for (const file of Array.from(files)) {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');

            if (!isImage && !isVideo) {
                toast({ title: "Invalid type", description: "Images/videos only", variant: "destructive" });
                continue;
            }

            // Create blob URL for local preview
            const previewUrl = URL.createObjectURL(file);
            setMediaFiles(prev => [...prev, {
                url: previewUrl,
                type: isImage ? 'image' : 'video',
                file // Keep reference for later upload
            }]);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };


    const removeMedia = (index: number) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async (draft: boolean = true) => {
        // Prevent double submission
        if (saving) return;

        if (!content.trim() && mediaFiles.length === 0 && !selectedGif) {
            toast({ title: "Empty post", description: "Add some content", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const postTitle = title.trim() || "";
            const generatedSlug = postTitle
                ? postTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "")
                : "post";
            const uniqueSlug = `${generatedSlug}-${Date.now().toString(36)}`;

            let guestIdLocal: string | null = null;
            if (!user && fingerprint) {
                const guestResult = await createOrUpdateGuest(pendingEmail || undefined);
                guestIdLocal = guestResult.guestId;

                if (guestResult.status === 'blocked') {
                    toast({ title: "Blocked", description: "Posting blocked", variant: "destructive" });
                    setSaving(false);
                    return;
                }

                if (guestResult.status === 'restricted') {
                    toast({ title: "Restricted", description: "Try again later", variant: "destructive" });
                    setSaving(false);
                    return;
                }

                if (guestResult.postCount >= 2 && !guestData?.email_verified) {
                    setShowEmailModal(true);
                    setSaving(false);
                    return;
                }
            }

            // Step 1: Create post first (without attachments for now)
            const postData = {
                title: postTitle,
                content,
                type: mediaFiles.length > 0 ? 'Image' : 'Text',
                slug: uniqueSlug,
                user_id: user?.id || null,
                guest_id: guestIdLocal,
                author_name: user?.username || user?.email || "Anonymous",
                author_email: user?.email || null,
                author_avatar: user?.avatarDataUrl || null,
                draft,
                attachments: null, // Will update after upload
                gif_url: selectedGif || null,
                music_metadata: musicMetadata || null, // Cached music metadata for fallback
            };

            const { data: post, error } = await supabase.from("posts").insert(postData).select().single();

            if (error) {
                console.error("Post creation error:", error);
                throw new Error(error.message || "Failed to create post");
            }

            // Step 2: Upload media files (now we have post.id)
            const uploadedMedia: { url: string; type: 'image' | 'video' | 'music' }[] = [];

            for (const media of mediaFiles) {
                if (media.file) {
                    const fileExt = media.file.name.split('.').pop();
                    const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                    const filePath = `post-media/${user?.id || 'anonymous'}/${post.id}/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('media')
                        .upload(filePath, media.file);

                    if (uploadError) {
                        console.error("Media upload error:", uploadError);
                        // Continue with other uploads even if one fails
                        continue;
                    }

                    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
                    uploadedMedia.push({ url: publicUrl, type: media.type });
                } else if (media.url && !media.url.startsWith('blob:')) {
                    // Already uploaded (music links, etc.)
                    uploadedMedia.push({ url: media.url, type: media.type });
                }
            }

            // Step 3: Update post with uploaded attachments (if any)
            if (uploadedMedia.length > 0) {
                const { error: updateError } = await supabase
                    .from("posts")
                    .update({ attachments: uploadedMedia })
                    .eq('id', post.id);

                if (updateError) {
                    console.error("Failed to update post with attachments:", updateError);
                    // Post is created, just without attachments - don't fail completely
                }
            }

            // Revoke blob URLs to free memory
            mediaFiles.forEach(m => {
                if (m.url.startsWith('blob:')) {
                    URL.revokeObjectURL(m.url);
                }
            });

            toast({
                title: draft ? "Draft saved" : "Published!",
                description: draft ? "Saved as draft" : "Your post is live",
            });

            if (!draft && post) navigate(`/post/${post.slug}`);
        } catch (error: any) {
            console.error("Save error:", error);
            toast({
                title: "Error",
                description: error.message || "Failed to save post. Please try again.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };


    const handleThreadPublish = async (items: { id: string; title: string; content: string; attachments: { url: string; type: 'image' | 'video' }[] }[]) => {
        try {
            const threadPosts = items.map(item => ({
                title: item.title || `Thread post`,
                content: item.content,
                attachments: item.attachments.length > 0 ? item.attachments : undefined,
            }));

            const { threadId, posts } = await createThread(threadPosts, {
                user_id: user?.id,
                author_name: user?.username || user?.email || "Anonymous",
                author_email: user?.email,
            });

            toast({ title: "Thread created!", description: `${posts?.length || 0} posts` });
            navigate(`/thread/${threadId}`);
        } catch (error) {
            toast({ title: "Error", description: "Failed to create thread", variant: "destructive" });
        }
    };

    const mediaCount = mediaFiles.length + (selectedGif ? 1 : 0);

    return (
        <>
            <div className="min-h-screen bg-black flex flex-col">
                {/* STICKY TOP BAR */}
                <header className="sticky top-0 z-40 bg-black/95 backdrop-blur border-b border-green-900/30">
                    <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-1 text-gray-400 hover:text-green-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span className="hidden sm:inline text-sm">Back</span>
                        </button>

                        <h1 className="font-mono text-green-400 text-sm font-medium">
                            {mode === "thread" ? "New Thread" : "New Post"}
                        </h1>

                        {/* Desktop publish button */}
                        <button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="hidden md:flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-medium text-sm rounded transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Publish
                        </button>

                        {/* Mobile placeholder for alignment */}
                        <div className="w-12 md:hidden" />
                    </div>
                </header>

                {/* MAIN CONTENT AREA */}
                <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
                    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
                        {/* POST TYPE SELECTOR */}
                        <div className="grid grid-cols-2 bg-gray-900/50 rounded-lg overflow-hidden border border-green-900/30">
                            <button
                                onClick={() => setMode("single")}
                                className={`py-3 text-sm font-medium transition-colors ${mode === "single"
                                    ? "bg-green-500/20 text-green-400"
                                    : "text-gray-500 hover:text-gray-300"
                                    }`}
                            >
                                Single Post
                            </button>
                            <button
                                onClick={() => setMode("thread")}
                                className={`py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors border-l border-green-900/30 ${mode === "thread"
                                    ? "bg-green-500/20 text-green-400"
                                    : "text-gray-500 hover:text-gray-300"
                                    }`}
                            >
                                <Link2 className="w-4 h-4" />
                                Thread
                            </button>
                        </div>

                        {mode === "thread" ? (
                            <ThreadCreator
                                onPublish={handleThreadPublish}
                                onCancel={() => setMode("single")}
                            />
                        ) : (
                            <>
                                {/* TITLE INPUT */}
                                <div>
                                    <input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Post title (optional)"
                                        className="w-full bg-transparent text-lg font-medium text-gray-100 placeholder-gray-600 border-b border-green-900/30 pb-3 focus:outline-none focus:border-green-500/50 transition-colors"
                                    />
                                </div>

                                {/* MEDIA SECTION - Collapsible */}
                                <div className="border border-green-900/30 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setMediaExpanded(!mediaExpanded)}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900/30 hover:bg-gray-900/50 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-gray-400">
                                            Media {mediaCount > 0 && `(${mediaCount}/4)`}
                                        </span>
                                        {mediaExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-gray-500" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-gray-500" />
                                        )}
                                    </button>

                                    {mediaExpanded && (
                                        <div className="p-4 space-y-3 bg-black/30">
                                            {/* Hidden file input */}
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*,video/*"
                                                multiple
                                                onChange={handleMediaUpload}
                                                className="hidden"
                                            />

                                            {/* Media Previews Grid */}
                                            {(mediaFiles.length > 0 || selectedGif) && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {mediaFiles.map((media, index) => (
                                                        <div key={index} className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden">
                                                            {media.type === 'image' ? (
                                                                <img src={media.url} alt="" className="w-full h-full object-cover" />
                                                            ) : media.type === 'video' ? (
                                                                <video src={media.url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center">
                                                                    <Music className="w-8 h-8 text-green-500" />
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => removeMedia(index)}
                                                                className="absolute top-1 right-1 w-6 h-6 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/80 rounded text-[10px] text-gray-400">
                                                                {media.type}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {selectedGif && (
                                                        <div className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden">
                                                            <img src={selectedGif} alt="GIF" className="w-full h-full object-cover" />
                                                            <button
                                                                onClick={() => setSelectedGif(null)}
                                                                className="absolute top-1 right-1 w-6 h-6 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/80 rounded text-[10px] text-gray-400">
                                                                gif
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Music Input */}
                                            {showMusicInput && (
                                                <div className="flex gap-2">
                                                    <input
                                                        id="music-url-input"
                                                        type="url"
                                                        placeholder="Paste Spotify, Apple Music, or YouTube URL"
                                                        className="flex-1 bg-gray-900/50 border border-green-900/30 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                if (e.currentTarget.value) addMusic(e.currentTarget.value);
                                                            }
                                                        }}
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const input = document.getElementById('music-url-input') as HTMLInputElement;
                                                            if (input?.value) addMusic(input.value);
                                                        }}
                                                        disabled={fetchingMusicMetadata}
                                                        className="px-3 py-2 bg-green-600 hover:bg-green-500 text-black text-sm font-medium rounded-lg disabled:opacity-50"
                                                    >
                                                        {fetchingMusicMetadata ? '...' : 'Add'}
                                                    </button>
                                                    <button
                                                        onClick={() => setShowMusicInput(false)}
                                                        className="p-2 text-gray-500 hover:text-red-400"
                                                    >
                                                        <X className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Add Media Buttons */}
                                            {mediaFiles.length < 4 && !showMusicInput && (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => fileInputRef.current?.click()}
                                                        disabled={uploadingMedia}
                                                        className="flex items-center gap-2 px-3 py-2 bg-gray-900/50 border border-green-900/30 rounded-lg text-sm text-gray-400 hover:text-green-400 hover:border-green-500/50 transition-colors disabled:opacity-50"
                                                    >
                                                        {uploadingMedia ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Plus className="w-4 h-4" />
                                                        )}
                                                        Photo/Video
                                                    </button>
                                                    <button
                                                        onClick={() => setShowMusicInput(true)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-gray-900/50 border border-green-900/30 rounded-lg text-sm text-gray-400 hover:text-green-400 hover:border-green-500/50 transition-colors"
                                                    >
                                                        <Music className="w-4 h-4" />
                                                        Music
                                                    </button>
                                                    <button
                                                        onClick={() => setShowGifPicker(true)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-gray-900/50 border border-green-900/30 rounded-lg text-sm text-gray-400 hover:text-green-400 hover:border-green-500/50 transition-colors"
                                                    >
                                                        <Smile className="w-4 h-4" />
                                                        GIF
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* CONTENT EDITOR - Main Focus */}
                                <div className="min-h-[300px]">
                                    <RichTextEditor
                                        content={content}
                                        onChange={setContent}
                                        placeholder="Write your post..."
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </main>

                {/* STICKY BOTTOM ACTION BAR - Mobile Only */}
                {mode === "single" && (
                    <div className="fixed bottom-0 left-0 right-0 md:hidden bg-black/95 backdrop-blur border-t border-green-900/30 px-4 py-3 safe-area-bottom">
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleSave(true)}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-900 border border-green-900/30 rounded-lg text-gray-400 font-medium text-sm hover:text-green-400 transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                Save Draft
                            </button>
                            <button
                                onClick={() => handleSave(false)}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 rounded-lg text-black font-medium text-sm hover:bg-green-400 transition-colors disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Publish
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Email Gate Modal */}
            {showEmailModal && guestId && (
                <EmailGateModal
                    guestId={guestId}
                    postCount={guestPostCount}
                    onVerified={handleEmailVerified}
                    onCancel={() => setShowEmailModal(false)}
                />
            )}

            {/* GIF Picker */}
            {showGifPicker && (
                <GifPicker
                    onSelect={(url) => {
                        setSelectedGif(url);
                        setShowGifPicker(false);
                    }}
                    onClose={() => setShowGifPicker(false)}
                />
            )}
        </>
    );
}
