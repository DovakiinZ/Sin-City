import { useState, useRef, useEffect } from "react";
import { X, Image, Film, Smile, Mic, Loader2, Search, Play, Pause, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaComposerProps {
    onClose: () => void;
    onMediaSelect: (file: File) => void;
    onGifSelect: (url: string, id: string) => void;
    onVoiceSend: (blob: Blob, duration: number) => void;
    isMobile?: boolean;
}

type Tab = 'media' | 'gif' | 'voice';

export default function MediaComposer({
    onClose,
    onMediaSelect,
    onGifSelect,
    onVoiceSend,
    isMobile
}: MediaComposerProps) {
    const [activeTab, setActiveTab] = useState<Tab>('media');
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 z-40"
                onClick={onClose}
            />

            {/* Bottom Sheet */}
            <div className={cn(
                "fixed left-0 right-0 bottom-0 z-50",
                "bg-gray-900 border-t border-green-900/30 rounded-t-2xl",
                "safe-area-bottom animate-in slide-in-from-bottom duration-300",
                isMobile ? "max-h-[70vh]" : "max-h-[50vh]"
            )}>
                {/* Handle */}
                <div className="flex justify-center py-2">
                    <div className="w-10 h-1 bg-gray-700 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-3 border-b border-green-900/20">
                    <h3 className="font-mono text-sm text-green-400">Add Media</h3>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-500 hover:text-gray-300"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-green-900/20">
                    <TabButton
                        active={activeTab === 'media'}
                        onClick={() => setActiveTab('media')}
                        icon={<Image className="w-4 h-4" />}
                        label="Photo/Video"
                    />
                    <TabButton
                        active={activeTab === 'gif'}
                        onClick={() => setActiveTab('gif')}
                        icon={<Smile className="w-4 h-4" />}
                        label="GIF"
                    />
                    <TabButton
                        active={activeTab === 'voice'}
                        onClick={() => setActiveTab('voice')}
                        icon={<Mic className="w-4 h-4" />}
                        label="Voice"
                    />
                </div>

                {/* Content */}
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(50vh - 120px)' }}>
                    {activeTab === 'media' && (
                        <MediaUploader
                            fileInputRef={fileInputRef}
                            onSelect={onMediaSelect}
                        />
                    )}
                    {activeTab === 'gif' && (
                        <GifPicker onSelect={onGifSelect} />
                    )}
                    {activeTab === 'voice' && (
                        <VoiceRecorder
                            onSend={onVoiceSend}
                            onCancel={onClose}
                        />
                    )}
                </div>
            </div>
        </>
    );
}

// Tab button component
function TabButton({ active, onClick, icon, label }: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm transition-colors",
                active
                    ? "text-green-400 border-b-2 border-green-500"
                    : "text-gray-500 hover:text-gray-300"
            )}
        >
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

// Media uploader component
function MediaUploader({
    fileInputRef,
    onSelect
}: {
    fileInputRef: React.RefObject<HTMLInputElement>;
    onSelect: (file: File) => void;
}) {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onSelect(file);
        }
    };

    return (
        <div className="p-6">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
            />
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-6 bg-gray-800/50 border-2 border-dashed border-green-900/50 rounded-xl hover:border-green-500/50 hover:bg-gray-800 transition-all"
                >
                    <Image className="w-8 h-8 text-green-500" />
                    <span className="text-sm text-gray-400">Photo</span>
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-6 bg-gray-800/50 border-2 border-dashed border-green-900/50 rounded-xl hover:border-green-500/50 hover:bg-gray-800 transition-all"
                >
                    <Film className="w-8 h-8 text-green-500" />
                    <span className="text-sm text-gray-400">Video</span>
                </button>
            </div>
        </div>
    );
}

// GIF picker component
function GifPicker({ onSelect }: { onSelect: (url: string, id: string) => void }) {
    const [query, setQuery] = useState("");
    const [gifs, setGifs] = useState<{ id: string; images: { fixed_height: { url: string } } }[]>([]);
    const [loading, setLoading] = useState(false);
    const API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

    const fetchGifs = async (searchQuery?: string) => {
        if (!API_KEY) return;

        setLoading(true);
        try {
            const endpoint = searchQuery
                ? `https://api.giphy.com/v1/gifs/search?api_key=${API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20`
                : `https://api.giphy.com/v1/gifs/trending?api_key=${API_KEY}&limit=20`;

            const res = await fetch(endpoint);
            const data = await res.json();
            setGifs(data.data || []);
        } catch (error) {
            console.error('Failed to fetch GIFs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGifs();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query) fetchGifs(query);
        }, 500);
        return () => clearTimeout(timer);
    }, [query]);

    if (!API_KEY) {
        return (
            <div className="p-6 text-center">
                <p className="text-gray-500 text-sm">API Key Missing</p>
                <p className="text-gray-600 text-xs mt-1">Add VITE_GIPHY_API_KEY to .env</p>
            </div>
        );
    }

    return (
        <div className="p-3">
            {/* Search */}
            <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search GIFs..."
                    className="w-full bg-gray-800 border border-green-900/30 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-green-500/50"
                />
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-1">
                    {gifs.map((gif) => (
                        <button
                            key={gif.id}
                            onClick={() => onSelect(gif.images.fixed_height.url, gif.id)}
                            className="aspect-square overflow-hidden rounded-md hover:ring-2 hover:ring-green-500 transition-all"
                        >
                            <img
                                src={gif.images.fixed_height.url}
                                alt="GIF"
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Voice recorder component
function VoiceRecorder({
    onSend,
    onCancel
}: {
    onSend: (blob: Blob, duration: number) => void;
    onCancel: () => void;
}) {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                setAudioUrl(URL.createObjectURL(blob));
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setDuration(0);

            timerRef.current = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);
        } catch (error) {
            console.error('Failed to start recording:', error);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
    };

    const handleSend = () => {
        if (audioBlob) {
            onSend(audioBlob, duration);
        }
    };

    const handleDelete = () => {
        setAudioBlob(null);
        setAudioUrl(null);
        setDuration(0);
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [audioUrl]);

    const formatDuration = (secs: number) => {
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        return `${mins}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="p-6 flex flex-col items-center gap-4">
            {!audioBlob ? (
                <>
                    <div className={cn(
                        "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                        isRecording
                            ? "bg-red-500 animate-pulse"
                            : "bg-green-600 hover:bg-green-500"
                    )}>
                        <Mic className="w-8 h-8 text-black" />
                    </div>

                    <div className="text-2xl font-mono text-gray-100">
                        {formatDuration(duration)}
                    </div>

                    <button
                        onPointerDown={startRecording}
                        onPointerUp={stopRecording}
                        onPointerLeave={stopRecording}
                        className="px-6 py-2 bg-gray-800 rounded-full text-sm text-gray-300"
                    >
                        {isRecording ? "Release to stop" : "Hold to record"}
                    </button>
                </>
            ) : (
                <>
                    <audio src={audioUrl!} controls className="w-full" />

                    <div className="flex gap-3">
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                        <button
                            onClick={handleSend}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-black rounded-lg hover:bg-green-500 transition-colors"
                        >
                            <Send className="w-4 h-4" />
                            Send
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
