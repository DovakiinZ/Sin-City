import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useMarkdownPreview } from "@/hooks/useMarkdownPreview";
import { useImageCropper } from "@/hooks/useImageCropper";
import { X, Plus, Image, Film, Loader2, Music, Smile, Send, Link2, Mic, Lock, Globe, ListOrdered } from "lucide-react";
import MusicEmbed from "./MusicEmbed";
import GifPicker from "./GifPicker";
import ImageCropperModal from "./ImageCropperModal";
import { getValidAccessToken } from "@/lib/spotify";

export type NewPost = {
    title: string;
    date?: string;
    content: string;
    attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
    gif_url?: string;
    is_registered_only?: boolean;
    pollData?: { question: string; options: string[] };
};

interface MinimalPostFormProps {
    onAdd: (p: NewPost) => void;
    onClose?: () => void;
}

export default function MinimalPostForm({ onAdd, onClose }: MinimalPostFormProps) {
    const [content, setContent] = useState("");
    const { user } = useAuth();
    const { toast } = useToast();
    const { detectUrls, extractTitle, parseInlineMarkdown } = useMarkdownPreview();

    // Media state
    const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video' | 'music' }[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [selectedGif, setSelectedGif] = useState<string | null>(null);
    const [isRegisteredOnly, setIsRegisteredOnly] = useState(false);

    // UI state
    const [showFab, setShowFab] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [showMusicInput, setShowMusicInput] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    
    // Poll state
    const [showPollInput, setShowPollInput] = useState(false);
    const [pollQuestion, setPollQuestion] = useState("");
    const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

    // Spotify state
    const [spotifySearchQuery, setSpotifySearchQuery] = useState("");
    const [spotifySearchResults, setSpotifySearchResults] = useState<any[]>([]);
    const [isSearchingSpotify, setIsSearchingSpotify] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const musicInputRef = useRef<HTMLInputElement>(null);
    const { cropperImage, isCropping, remainingCount, processFiles, advanceQueue, cancelCrop } = useImageCropper();
    
    // Check if content is Arabic for real-time alignment
    const contentIsArabic = useMemo(() => {
        const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
        return arabicRegex.test(content);
    }, [content]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.max(120, textareaRef.current.scrollHeight) + 'px';
        }
    }, [content]);

    // Detect music URLs in content
    const detectedUrls = useMemo(() => detectUrls(content), [content, detectUrls]);
    const hasMusicUrl = detectedUrls.some(u => u.type === 'spotify' || u.type === 'youtube');

    // Get first music URL for preview
    const musicPreviewUrl = detectedUrls.find(u => u.type === 'spotify' || u.type === 'youtube')?.url;

    const addMusic = (url: string) => {
        if (!url.trim()) return;
        setMediaFiles(prev => [...prev, { url, type: 'music' }]);
        setShowMusicInput(false);
        setShowFab(false);
        setSpotifySearchQuery("");
        setSpotifySearchResults([]);
    };

    const searchSpotify = async (query: string) => {
        if (!query.trim()) {
            setSpotifySearchResults([]);
            return;
        }
        setIsSearchingSpotify(true);
        try {
            const token = await getValidAccessToken();
            if (!token) throw new Error("No Spotify token");
            
            const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSpotifySearchResults(data.tracks?.items || []);
            }
        } catch (err) {
            console.error("Spotify search failed:", err);
        } finally {
            setIsSearchingSpotify(false);
        }
    };

    // Auto-search when query changes
    useEffect(() => {
        const timer = setTimeout(() => {
            if (spotifySearchQuery) searchSpotify(spotifySearchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [spotifySearchQuery]);

    const uploadFileOrBlob = async (fileOrBlob: File | Blob, type: 'image' | 'video') => {
        const ext = fileOrBlob instanceof File ? fileOrBlob.name.split('.').pop() : 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
        const filePath = `post-media/${user?.id || 'anonymous'}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('media').upload(filePath, fileOrBlob);
        if (uploadError) {
            toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        setMediaFiles(prev => [...prev, { url: publicUrl, type }]);
    };

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        if (mediaFiles.length + files.length > 4) {
            toast({ title: "Limit reached", description: "Max 4 files", variant: "destructive" });
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setShowFab(false);
        const fileArray = Array.from(files);
        const validFiles = fileArray.filter(f => {
            if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
                toast({ title: "Invalid type", description: "Images/videos only", variant: "destructive" });
                return false;
            }
            return true;
        });

        const skipFiles = processFiles(validFiles);

        if (skipFiles.length > 0) {
            setUploadingMedia(true);
            try {
                for (const file of skipFiles) {
                    await uploadFileOrBlob(file, file.type.startsWith('video/') ? 'video' : 'image');
                }
            } finally {
                setUploadingMedia(false);
            }
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleCropComplete = async (blob: Blob) => {
        setUploadingMedia(true);
        try {
            await uploadFileOrBlob(blob, 'image');
        } finally {
            setUploadingMedia(false);
        }
        advanceQueue();
    };

    const removeMedia = (index: number) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
    };

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        // Check for pending music input
        const currentMediaFiles = [...mediaFiles];
        if (showMusicInput && musicInputRef.current?.value) {
            currentMediaFiles.push({ url: musicInputRef.current.value, type: 'music' });
        }

        const validPollOptions = pollOptions.filter(o => o.trim() !== "");
        const hasPoll = showPollInput && pollQuestion.trim() && validPollOptions.length >= 2;

        if (showPollInput) {
            if (!pollQuestion.trim()) {
                toast({ title: "Poll incomplete", description: "Add a poll question or remove the poll", variant: "destructive" });
                return;
            }
            if (validPollOptions.length < 2) {
                toast({ title: "Poll incomplete", description: "Add at least 2 options or remove the poll", variant: "destructive" });
                return;
            }
        }

        if (!content.trim() && currentMediaFiles.length === 0 && !selectedGif && !hasPoll) return;

        // Extract title from first # heading
        const autoTitle = extractTitle(content);

        // Validate poll
        const validOptions = pollOptions.filter(o => o.trim() !== "");
        const pollData = (showPollInput && pollQuestion.trim() && validOptions.length >= 2) 
            ? { question: pollQuestion.trim(), options: validOptions } 
            : undefined;

        onAdd({
            title: autoTitle || "",
            date: new Date().toISOString().slice(0, 10),
            content: parseInlineMarkdown(content),
            attachments: currentMediaFiles.length > 0 ? currentMediaFiles : undefined,
            gif_url: selectedGif || undefined,
            is_registered_only: isRegisteredOnly,
            pollData,
        });

        setContent("");
        setMediaFiles([]);
        setSelectedGif(null);
        setIsRegisteredOnly(false);
        setShowMusicInput(false);
        setShowPollInput(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setShowFab(false);
        onClose?.();
    }

    const hasContent = content.trim() || mediaFiles.length > 0 || selectedGif || (showPollInput && pollQuestion.trim());
    const mediaCount = mediaFiles.length + (selectedGif ? 1 : 0);

    return (
        <>
            <form onSubmit={handleSubmit} className="relative">
                {/* Main Writing Area */}
                <div className={`relative bg-black/40 border rounded-xl transition-all duration-300 ${isFocused
                    ? 'border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                    : 'border-green-900/30'
                    }`}>

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        dir="auto"
                        style={{
                            textAlign: contentIsArabic ? 'right' : 'left',
                            direction: contentIsArabic ? 'rtl' : 'ltr'
                        }}
                        className={`w-full min-h-[120px] max-h-[60vh] bg-transparent text-gray-100 placeholder-gray-600 p-4 pb-14 focus:outline-none resize-none text-base leading-relaxed ${contentIsArabic ? 'arabic-text' : ''}`}
                        placeholder="What's on your mind?&#10;&#10;Use **bold**, _italic_, # heading, > quote..."
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
                        <div className="px-4 pb-2">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                                <Link2 className="w-3 h-3" />
                                <span>Auto-detected music</span>
                            </div>
                            <MusicEmbed url={musicPreviewUrl} compact />
                        </div>
                    )}

                    {/* Media Previews */}
                    {(mediaFiles.length > 0 || selectedGif) && (
                        <div className="px-4 pb-3">
                            <div className="flex flex-wrap gap-2">
                                {mediaFiles.map((media, index) => (
                                    <div key={index} className="relative w-16 h-16 bg-gray-900 rounded-lg overflow-hidden group">
                                        {media.type === 'image' ? (
                                            <img src={media.url} alt="" className="w-full h-full object-cover" />
                                        ) : media.type === 'video' ? (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                <Film className="w-5 h-5 text-green-500" />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                <Music className="w-5 h-5 text-green-500" />
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => removeMedia(index)}
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                        >
                                            <X className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                ))}
                                {selectedGif && (
                                    <div className="relative w-16 h-16 bg-gray-900 rounded-lg overflow-hidden group">
                                        <img src={selectedGif} alt="GIF" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setSelectedGif(null)}
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                        >
                                            <X className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Music Search / Input */}
                    {showMusicInput && (
                        <div className="px-4 pb-3 relative z-50">
                            <div className="flex gap-2 items-center">
                                <input
                                    ref={musicInputRef}
                                    type="text"
                                    placeholder="Search Spotify or paste URL..."
                                    value={spotifySearchQuery}
                                    onChange={(e) => setSpotifySearchQuery(e.target.value)}
                                    className="flex-1 bg-gray-900/50 border border-green-900/30 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            // If it's a URL, add it directly
                                            if (spotifySearchQuery.includes('http')) {
                                                addMusic(spotifySearchQuery);
                                            } else if (spotifySearchResults.length > 0) {
                                                addMusic(spotifySearchResults[0].external_urls.spotify);
                                            }
                                        }
                                        if (e.key === 'Escape') setShowMusicInput(false);
                                    }}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (spotifySearchQuery.includes('http')) addMusic(spotifySearchQuery);
                                        else if (spotifySearchResults.length > 0) addMusic(spotifySearchResults[0].external_urls.spotify);
                                    }}
                                    className="px-3 py-2 bg-green-600 hover:bg-green-500 text-black text-sm font-medium rounded-lg transition-colors"
                                >
                                    Add
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowMusicInput(false);
                                        setSpotifySearchQuery("");
                                        setSpotifySearchResults([]);
                                    }}
                                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            
                            {/* Spotify Search Results Dropdown */}
                            {spotifySearchQuery && !spotifySearchQuery.includes('http') && (
                                <div className="mt-2 bg-gray-900 border border-green-900/30 rounded-lg max-h-48 overflow-y-auto">
                                    {isSearchingSpotify ? (
                                        <div className="p-3 text-center text-gray-500 text-sm">Searching...</div>
                                    ) : spotifySearchResults.length > 0 ? (
                                        spotifySearchResults.map((track) => (
                                            <div 
                                                key={track.id} 
                                                className="flex items-center gap-3 p-2 hover:bg-green-900/20 cursor-pointer transition-colors"
                                                onClick={() => addMusic(track.external_urls.spotify)}
                                            >
                                                <img src={track.album.images[2]?.url || track.album.images[0]?.url} alt="" className="w-10 h-10 rounded" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm text-green-400 truncate">{track.name}</div>
                                                    <div className="text-xs text-gray-500 truncate">{track.artists.map((a: any) => a.name).join(', ')}</div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-3 text-center text-gray-500 text-sm">No results found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Poll Input */}
                    {showPollInput && (
                        <div className="px-4 pb-3 relative z-40 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-medium text-green-400">Create Poll</h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowPollInput(false);
                                        setPollQuestion("");
                                        setPollOptions(["", ""]);
                                    }}
                                    className="text-gray-500 hover:text-red-400"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="Ask a question..."
                                value={pollQuestion}
                                onChange={(e) => setPollQuestion(e.target.value)}
                                className="w-full bg-gray-900/50 border border-green-900/30 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                            />
                            <div className="space-y-2">
                                {pollOptions.map((opt, i) => (
                                    <div key={i} className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder={`Option ${i + 1}`}
                                            value={opt}
                                            onChange={(e) => {
                                                const newOpts = [...pollOptions];
                                                newOpts[i] = e.target.value;
                                                setPollOptions(newOpts);
                                            }}
                                            className="flex-1 bg-gray-900/50 border border-green-900/30 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                        />
                                        {pollOptions.length > 2 && (
                                            <button 
                                                type="button"
                                                onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                                                className="text-gray-500 hover:text-red-400 p-1"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {pollOptions.length < 4 && (
                                <button
                                    type="button"
                                    onClick={() => setPollOptions([...pollOptions, ""])}
                                    className="text-xs text-green-500 hover:text-green-400 flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> Add Option
                                </button>
                            )}
                        </div>
                    )}

                    {/* Bottom Bar */}
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 border-t border-green-900/20 bg-black/20 rounded-b-xl">
                        {/* Left side - FAB */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowFab(!showFab)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${showFab
                                    ? 'bg-green-500 text-black rotate-45'
                                    : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                                    }`}
                            >
                                <Plus className="w-4 h-4" />
                            </button>

                            {/* FAB Menu */}
                            {showFab && (
                                <div className="absolute bottom-full left-0 mb-2 flex gap-1 p-1 bg-gray-900 border border-green-900/30 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    {mediaFiles.length < 4 && (
                                        <button
                                            type="button"
                                            onClick={() => { fileInputRef.current?.click(); }}
                                            disabled={uploadingMedia}
                                            className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                                            title="Add Photo"
                                        >
                                            {uploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setShowMusicInput(true); setShowFab(false); }}
                                        className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                                        title="Add Music"
                                    >
                                        <Music className="w-5 h-5" />
                                    </button>
                                    {!selectedGif && (
                                        <button
                                            type="button"
                                            onClick={() => { setShowGifPicker(true); setShowFab(false); }}
                                            className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                                            title="Add GIF"
                                        >
                                            <Smile className="w-5 h-5" />
                                        </button>
                                    )}
                                    {!showPollInput && (
                                        <button
                                            type="button"
                                            onClick={() => { setShowPollInput(true); setShowFab(false); }}
                                            className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                                            title="Add Poll"
                                        >
                                            <ListOrdered className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right side - Actions */}
                        <div className="flex items-center gap-4">
                            {/* Visibility Toggle */}
                            <button
                                type="button"
                                onClick={() => setIsRegisteredOnly(!isRegisteredOnly)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all duration-200 ${isRegisteredOnly
                                    ? 'text-blue-400 bg-blue-900/20 border border-blue-500/30'
                                    : 'text-gray-500 hover:text-green-400'
                                    }`}
                                title={isRegisteredOnly ? "Registered users only" : "Public - Everyone can see"}
                            >
                                {isRegisteredOnly ? (
                                    <>
                                        <Lock className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-medium uppercase tracking-wider">Registered</span>
                                    </>
                                ) : (
                                    <>
                                        <Globe className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-medium uppercase tracking-wider">Public</span>
                                    </>
                                )}
                            </button>

                            <div className="flex items-center gap-2">
                            {onClose && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={uploadingMedia || !hasContent}
                                className="flex items-center gap-2 px-4 py-1.5 bg-green-500 hover:bg-green-400 text-black font-medium text-sm rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-500"
                            >
                                <Send className="w-4 h-4" />
                                Post
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Character hint for short posts */}
                {content.length > 0 && content.length < 280 && !mediaFiles.length && !selectedGif && (
                    <div className="absolute -bottom-6 left-0 text-xs text-gray-600">
                        {280 - content.length} characters for a quick thought
                    </div>
                )}
            </form>

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

            {/* Image Cropper Modal */}
            {isCropping && cropperImage && (
                <ImageCropperModal
                    image={cropperImage}
                    onCropComplete={handleCropComplete}
                    onCancel={cancelCrop}
                    showAspectRatioSelector
                />
            )}
        </>
    );
}
