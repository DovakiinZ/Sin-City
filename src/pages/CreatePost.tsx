import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import ThreadCreator from "@/components/thread/ThreadCreator";
import { createThread } from "@/hooks/useSupabasePosts";
import { useToast } from "@/hooks/use-toast";
import { useMarkdownPreview } from "@/hooks/useMarkdownPreview";
import { X, Plus, Image, Film, Loader2, Link2, Music, Smile, ArrowLeft, Save, Send, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import GifPicker from "@/components/GifPicker";
import MusicEmbed from "@/components/MusicEmbed";
import { useIdentity, useContentAuthor } from "@/hooks/useIdentity";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import EmailGateModal from "@/components/EmailGateModal";

type PostMode = "single" | "thread";

// Minimal Single Post Editor Component
interface MinimalEditorProps {
    title: string;
    setTitle: (v: string) => void;
    content: string;
    setContent: (v: string) => void;
    textAlign: 'right' | 'center' | 'left';
    setTextAlign: (v: 'right' | 'center' | 'left') => void;
    mediaFiles: { url: string; type: 'image' | 'video' | 'music'; file?: File }[];
    setMediaFiles: React.Dispatch<React.SetStateAction<{ url: string; type: 'image' | 'video' | 'music'; file?: File }[]>>;
    selectedGif: string | null;
    setSelectedGif: (v: string | null) => void;
    showMusicInput: boolean;
    setShowMusicInput: (v: boolean) => void;
    showGifPicker: boolean;
    setShowGifPicker: (v: boolean) => void;
    uploadingMedia: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    removeMedia: (index: number) => void;
    addMusic: (url: string) => void;
    user: any;
}

function MinimalSinglePostEditor({
    title, setTitle, content, setContent, textAlign, setTextAlign,
    mediaFiles, setMediaFiles, selectedGif, setSelectedGif,
    showMusicInput, setShowMusicInput, showGifPicker, setShowGifPicker,
    uploadingMedia, fileInputRef, handleMediaUpload, removeMedia, addMusic, user
}: MinimalEditorProps) {
    const [showFab, setShowFab] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const musicInputRef = useRef<HTMLInputElement>(null);
    const { detectUrls } = useMarkdownPreview();

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.max(200, textareaRef.current.scrollHeight) + 'px';
        }
    }, [content]);

    // Detect music URLs in content
    const detectedUrls = useMemo(() => detectUrls(content), [content, detectUrls]);
    const musicPreviewUrl = detectedUrls.find(u => u.type === 'spotify' || u.type === 'youtube')?.url;

    return (
        <div className="space-y-4">
            {/* Main Writing Area */}
            <div className={`relative bg-black/40 border rounded-xl transition-all duration-300 ${isFocused
                ? 'border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.15)]'
                : 'border-green-900/30'
                }`}>

                {/* Alignment Toggle */}
                <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-green-900/20 bg-black/20 rounded-t-xl">
                    <div className="flex bg-gray-900/80 rounded-lg p-1 border border-green-900/30">
                        <button
                            type="button"
                            onClick={() => setTextAlign('right')}
                            className={`p-1.5 rounded transition-all ${textAlign === 'right' ? 'bg-green-500 text-black shadow-sm' : 'text-gray-400 hover:text-green-400 hover:bg-white/5'}`}
                            title="Right / يمين"
                        >
                            <AlignRight className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setTextAlign('center')}
                            className={`p-1.5 rounded transition-all ${textAlign === 'center' ? 'bg-green-500 text-black shadow-sm' : 'text-gray-400 hover:text-green-400 hover:bg-white/5'}`}
                            title="Center / وسط"
                        >
                            <AlignCenter className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setTextAlign('left')}
                            className={`p-1.5 rounded transition-all ${textAlign === 'left' ? 'bg-green-500 text-black shadow-sm' : 'text-gray-400 hover:text-green-400 hover:bg-white/5'}`}
                            title="Left / يسار"
                        >
                            <AlignLeft className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Textarea - Preserves text exactly as typed */}
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    dir="rtl"
                    style={{
                        textAlign: textAlign,
                        unicodeBidi: 'plaintext'
                    }}
                    className="w-full min-h-[200px] max-h-[60vh] bg-transparent text-gray-100 placeholder-gray-600 p-5 pb-16 focus:outline-none resize-none text-base leading-relaxed"
                    placeholder="ماذا يدور في ذهنك؟"
                />

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleMediaUpload}
                    className="hidden"
                />

                {/* URL Preview (auto-detected music links) */}
                {musicPreviewUrl && (
                    <div className="px-5 pb-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                            <Link2 className="w-3 h-3" />
                            <span>Auto-detected music</span>
                        </div>
                        <MusicEmbed url={musicPreviewUrl} compact />
                    </div>
                )}

                {/* Media Previews */}
                {(mediaFiles.length > 0 || selectedGif) && (
                    <div className="px-5 pb-3">
                        <div className="flex flex-wrap gap-2">
                            {mediaFiles.map((media, index) => (
                                <div key={index} className="relative w-20 h-20 bg-gray-900 rounded-lg overflow-hidden group">
                                    {media.type === 'image' ? (
                                        <img src={media.url} alt="" className="w-full h-full object-cover" />
                                    ) : media.type === 'video' ? (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                            <Film className="w-6 h-6 text-green-500" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                            <Music className="w-6 h-6 text-green-500" />
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeMedia(index)}
                                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                    >
                                        <X className="w-5 h-5 text-red-400" />
                                    </button>
                                </div>
                            ))}
                            {selectedGif && (
                                <div className="relative w-20 h-20 bg-gray-900 rounded-lg overflow-hidden group">
                                    <img src={selectedGif} alt="GIF" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setSelectedGif(null)}
                                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                    >
                                        <X className="w-5 h-5 text-red-400" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Music URL Input (inline) */}
                {showMusicInput && (
                    <div className="px-5 pb-3 relative z-50">
                        <div className="flex gap-2 items-center">
                            <input
                                ref={musicInputRef}
                                type="url"
                                placeholder="Paste Spotify or YouTube URL..."
                                className="flex-1 bg-gray-900/50 border border-green-900/30 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (e.currentTarget.value) addMusic(e.currentTarget.value);
                                    }
                                    if (e.key === 'Escape') setShowMusicInput(false);
                                }}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    if (musicInputRef.current?.value) addMusic(musicInputRef.current.value);
                                }}
                                className="px-3 py-2 bg-green-600 hover:bg-green-500 text-black text-sm font-medium rounded-lg transition-colors"
                            >
                                Add
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowMusicInput(false)}
                                className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Bottom Bar with FAB */}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 border-t border-green-900/20 bg-black/30 rounded-b-xl">
                    {/* FAB */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowFab(!showFab)}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${showFab
                                ? 'bg-green-500 text-black rotate-45'
                                : 'bg-green-900/40 text-green-400 hover:bg-green-900/60'
                                }`}
                        >
                            <Plus className="w-5 h-5" />
                        </button>

                        {/* FAB Menu */}
                        {showFab && (
                            <div className="absolute bottom-full left-0 mb-2 flex gap-1.5 p-1.5 bg-gray-900 border border-green-900/30 rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {mediaFiles.length < 4 && (
                                    <button
                                        type="button"
                                        onClick={() => { fileInputRef.current?.click(); setShowFab(false); }}
                                        disabled={uploadingMedia}
                                        className="p-2.5 text-gray-400 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                                        title="Add Photo/Video"
                                    >
                                        {uploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setShowMusicInput(true); setShowFab(false); }}
                                    className="p-2.5 text-gray-400 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                                    title="Add Music"
                                >
                                    <Music className="w-5 h-5" />
                                </button>
                                {!selectedGif && (
                                    <button
                                        type="button"
                                        onClick={() => { setShowGifPicker(true); setShowFab(false); }}
                                        className="p-2.5 text-gray-400 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                                        title="Add GIF"
                                    >
                                        <Smile className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Character count */}
                    {content.length > 0 && content.length < 280 && !mediaFiles.length && !selectedGif && (
                        <span className="text-xs text-gray-600">
                            {280 - content.length} for quick thought
                        </span>
                    )}
                </div>
            </div>

            {/* Click outside to close FAB */}
            {showFab && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowFab(false)}
                />
            )}

            {/* GIF Picker Modal */}
            {showGifPicker && (
                <GifPicker
                    onSelect={(url) => {
                        setSelectedGif(url);
                        setShowGifPicker(false);
                    }}
                    onClose={() => setShowGifPicker(false)}
                />
            )}
        </div>
    );
}

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
    const [textAlign, setTextAlign] = useState<'right' | 'center' | 'left'>('right');
    const [saving, setSaving] = useState(false);

    // Media state
    const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video' | 'music'; file?: File }[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [showMusicInput, setShowMusicInput] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [selectedGif, setSelectedGif] = useState<string | null>(null);
    const [mediaExpanded, setMediaExpanded] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Identity
    const { identity, refreshIdentity } = useIdentity();
    const { user_id, guest_id, isReady } = useContentAuthor();

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

    const addMusic = (url: string) => {
        setMediaFiles(prev => [...prev, { url, type: 'music' }]);
        setShowMusicInput(false);
    };

    const handleEmailVerified = async (email: string) => {
        setShowEmailModal(false);
        await refreshIdentity();
        handleSave(false);
    };

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        if (mediaFiles.length + files.length > 4) {
            toast({ title: "Limit reached", description: "Max 4 files", variant: "destructive" });
            return;
        }

        setUploadingMedia(true);
        try {
            for (const file of Array.from(files)) {
                const isImage = file.type.startsWith('image/');
                const isVideo = file.type.startsWith('video/');

                if (!isImage && !isVideo) {
                    toast({ title: "Invalid type", description: "Images/videos only", variant: "destructive" });
                    continue;
                }

                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                const filePath = `post-media/${user?.id || 'anonymous'}/${fileName}`;

                const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file);

                if (uploadError) {
                    toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
                    continue;
                }

                const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
                setMediaFiles(prev => [...prev, { url: publicUrl, type: isImage ? 'image' : 'video', file }]);
            }
        } catch (error) {
            toast({ title: "Error", description: "Upload failed", variant: "destructive" });
        } finally {
            setUploadingMedia(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removeMedia = (index: number) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async (draft: boolean = true) => {
        if (!content.trim() && mediaFiles.length === 0 && !selectedGif) {
            toast({ title: "Empty post", description: "Add some content", variant: "destructive" });
            return;
        }

        if (!isReady) {
            toast({ title: "Initializing...", description: "Please wait a moment" });
            return;
        }

        setSaving(true);
        try {
            const postTitle = title.trim() || "";
            const generatedSlug = postTitle
                ? postTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "")
                : "post";
            const uniqueSlug = `${generatedSlug}-${Date.now().toString(36)}`;

            // Validation for anonymous users
            if (identity?.type === 'anon') {
                if (identity.status === 'blocked') {
                    toast({ title: "Blocked", description: "Posting blocked", variant: "destructive" });
                    setSaving(false);
                    return;
                }

                if (identity.status === 'restricted') {
                    toast({ title: "Restricted", description: "Try again later", variant: "destructive" });
                    setSaving(false);
                    return;
                }

                if ((identity.post_count || 0) >= 2 && !identity.email_verified) {
                    setShowEmailModal(true);
                    setSaving(false);
                    return;
                }
            }

            const postData = {
                title: postTitle,
                content,
                text_align: textAlign,
                type: mediaFiles.length > 0 ? 'Image' : 'Text',
                slug: uniqueSlug,
                user_id: user_id || null,
                guest_id: guest_id || null,
                author_type: user_id ? 'user' : 'anon',
                author_name: user?.username || user?.email || identity?.anon_id || "Anonymous",
                author_email: user?.email || null,
                author_avatar: user?.avatarDataUrl || null,
                draft,
                attachments: mediaFiles.length > 0 ? mediaFiles.map(m => ({ url: m.url, type: m.type })) : null,
                gif_url: selectedGif || null,
            };

            // DEBUG: Log what we're sending
            console.log('[CreatePost] Attempting insert with:', {
                user_id: postData.user_id,
                guest_id: postData.guest_id,
                author_type: postData.author_type,
                identity_type: identity?.type,
                identity_id: identity?.id,
            });

            // Validate: must have either user_id OR guest_id
            if (!postData.user_id && !postData.guest_id) {
                console.error('[CreatePost] No valid identity - both user_id and guest_id are null!');
                toast({
                    title: "Identity Error",
                    description: "Unable to identify you. Please refresh and try again.",
                    variant: "destructive"
                });
                setSaving(false);
                return;
            }

            const { data: post, error } = await supabase.from("posts").insert(postData).select().single();

            if (error) {
                console.error('[CreatePost] Insert error:', error);
                throw error;
            }

            toast({
                title: draft ? "Draft saved" : "Published!",
                description: draft ? "Saved as draft" : "Your post is live",
            });

            if (!draft && post) navigate(`/post/${post.slug}`);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to save", variant: "destructive" });
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
                            <MinimalSinglePostEditor
                                title={title}
                                setTitle={setTitle}
                                content={content}
                                setContent={setContent}
                                textAlign={textAlign}
                                setTextAlign={setTextAlign}
                                mediaFiles={mediaFiles}
                                setMediaFiles={setMediaFiles}
                                selectedGif={selectedGif}
                                setSelectedGif={setSelectedGif}
                                showMusicInput={showMusicInput}
                                setShowMusicInput={setShowMusicInput}
                                showGifPicker={showGifPicker}
                                setShowGifPicker={setShowGifPicker}
                                uploadingMedia={uploadingMedia}
                                fileInputRef={fileInputRef}
                                handleMediaUpload={handleMediaUpload}
                                removeMedia={removeMedia}
                                addMusic={addMusic}
                                user={user}
                            />
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
            {showEmailModal && guest_id && (
                <EmailGateModal
                    guestId={guest_id}
                    postCount={identity?.post_count || 0}
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
