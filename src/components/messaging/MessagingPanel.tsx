import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, ArrowLeft, Send, Image, Mic, Play, Pause, Plus, Camera, Film, Smile, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSessions, Session } from "@/hooks/useSessions";
import { useSessionMessages, SessionMessage } from "@/hooks/useSessionMessages";
import { useDeviceDetect } from "@/hooks/useDeviceDetect";
import { Link } from "react-router-dom";

// ============================================================================
// LOG MESSAGE COMPONENT
// ============================================================================
interface LogMessageProps {
    message: SessionMessage;
    isSent: boolean;
    myUsername: string;
    otherUsername: string;
}

function LogMessage({ message, isSent, myUsername, otherUsername }: LogMessageProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [videoPlaying, setVideoPlaying] = useState(false);
    const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: 'image' | 'video' | 'gif' } | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const timeStr = new Date(message.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const displayName = message.use_masked_identity && message.masked_alias
        ? message.masked_alias
        : isSent ? myUsername : otherUsername;

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const toggleVideo = () => {
        if (!videoRef.current) return;
        if (videoPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setVideoPlaying(!videoPlaying);
    };

    // Media thumbnail component with proper sizing
    const MediaThumbnail = ({ src, type, onClick }: { src: string; type: 'image' | 'video' | 'gif'; onClick: () => void }) => (
        <div
            className="relative w-[70%] max-w-[200px] h-[140px] md:h-[180px] rounded-lg overflow-hidden cursor-pointer group border border-green-500/20 hover:border-green-500/40 transition-colors"
            onClick={onClick}
        >
            {type === 'video' ? (
                <>
                    <video src={src} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-10 h-10 rounded-full bg-green-500/80 flex items-center justify-center">
                            <Play className="w-5 h-5 text-black ml-0.5" />
                        </div>
                    </div>
                </>
            ) : (
                <img src={src} alt="" className="w-full h-full object-cover" />
            )}
            {/* Subtle fade at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
            {/* Type badge */}
            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-gray-400 font-mono">
                {type.toUpperCase()}
            </div>
            {/* Expand hint on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                <span className="text-white text-xs font-mono bg-black/60 px-2 py-1 rounded">Tap to view</span>
            </div>
        </div>
    );

    // Fullscreen Media Viewer
    const FullscreenViewer = () => {
        if (!fullscreenMedia) return null;

        return (
            <div
                className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
                onClick={() => setFullscreenMedia(null)}
            >
                <button
                    className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
                    onClick={() => setFullscreenMedia(null)}
                >
                    <X className="w-6 h-6" />
                </button>

                {fullscreenMedia.type === 'video' ? (
                    <video
                        src={fullscreenMedia.url}
                        controls
                        autoPlay
                        className="max-w-[95vw] max-h-[90vh] rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <img
                        src={fullscreenMedia.url}
                        alt=""
                        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                )}

                <div className="absolute bottom-4 left-0 right-0 text-center">
                    <span className="text-gray-500 text-xs font-mono">Tap outside to close</span>
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="font-mono text-sm leading-relaxed hover:bg-green-500/5 px-2 py-1 -mx-2 rounded transition-colors">
                {/* Text message */}
                {message.content && (
                    <div className="flex items-start gap-1.5">
                        <span className="text-gray-600 text-xs w-10 flex-shrink-0">{timeStr}</span>
                        <span className={`flex-shrink-0 ${message.use_masked_identity ? 'text-purple-400' : isSent ? 'text-cyan-400' : 'text-green-400'
                            }`}>
                            {message.use_masked_identity ? '' : '@'}{displayName}
                        </span>
                        <span className="text-gray-200 break-words flex-1">{message.content}</span>
                    </div>
                )}

                {/* Image message */}
                {message.media_type === 'image' && message.media_url && (
                    <>
                        <div className="flex items-start gap-1.5">
                            <span className="text-gray-600 text-xs w-10 flex-shrink-0">{timeStr}</span>
                            <span className={`flex-shrink-0 ${isSent ? 'text-cyan-400' : 'text-green-400'}`}>
                                @{displayName}
                            </span>
                        </div>
                        <div className="ml-12 mt-1">
                            <MediaThumbnail
                                src={message.media_url}
                                type="image"
                                onClick={() => setFullscreenMedia({ url: message.media_url!, type: 'image' })}
                            />
                        </div>
                    </>
                )}

                {/* Video message */}
                {message.media_type === 'video' && message.media_url && (
                    <>
                        <div className="flex items-start gap-1.5">
                            <span className="text-gray-600 text-xs w-10 flex-shrink-0">{timeStr}</span>
                            <span className={`flex-shrink-0 ${isSent ? 'text-cyan-400' : 'text-green-400'}`}>
                                @{displayName}
                            </span>
                        </div>
                        <div className="ml-12 mt-1">
                            <MediaThumbnail
                                src={message.media_url}
                                type="video"
                                onClick={() => setFullscreenMedia({ url: message.media_url!, type: 'video' })}
                            />
                        </div>
                    </>
                )}

                {/* GIF message */}
                {message.gif_url && (
                    <>
                        <div className="flex items-start gap-1.5">
                            <span className="text-gray-600 text-xs w-10 flex-shrink-0">{timeStr}</span>
                            <span className={`flex-shrink-0 ${isSent ? 'text-cyan-400' : 'text-green-400'}`}>
                                @{displayName}
                            </span>
                        </div>
                        <div className="ml-12 mt-1">
                            <MediaThumbnail
                                src={message.gif_url}
                                type="gif"
                                onClick={() => setFullscreenMedia({ url: message.gif_url!, type: 'gif' })}
                            />
                        </div>
                    </>
                )}

                {/* Voice message */}
                {message.voice_url && (
                    <div className="flex items-start gap-1.5">
                        <span className="text-gray-600 text-xs w-10 flex-shrink-0">{timeStr}</span>
                        <span className={`flex-shrink-0 ${isSent ? 'text-cyan-400' : 'text-green-400'}`}>
                            @{displayName}
                        </span>
                        <button onClick={toggleAudio} className="flex items-center gap-1.5 text-gray-400 hover:text-green-400">
                            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            <span className="text-xs">[VOICE {message.voice_duration_seconds || 0}s]</span>
                        </button>
                        <audio ref={audioRef} src={message.voice_url} onEnded={() => setIsPlaying(false)} className="hidden" />
                    </div>
                )}
            </div>

            {/* Fullscreen viewer portal */}
            <FullscreenViewer />
        </>
    );
}


// ============================================================================
// GIPHY PICKER
// ============================================================================
interface GiphyPickerProps {
    onSelect: (url: string, id: string) => void;
    onClose: () => void;
}

function GiphyPicker({ onSelect, onClose }: GiphyPickerProps) {
    const [query, setQuery] = useState("");
    const [gifs, setGifs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const apiKey = import.meta.env.VITE_GIPHY_API_KEY;

    const fetchGifs = async (endpoint: 'search' | 'trending', searchQuery?: string) => {
        if (!apiKey) {
            setError("GIPHY API key not configured");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const url = endpoint === 'search'
                ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(searchQuery || '')}&rating=pg-13&limit=24`
                : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&rating=pg-13&limit=24`;

            const res = await fetch(url);

            if (!res.ok) {
                throw new Error(`GIPHY API error: ${res.status}`);
            }

            const data = await res.json();

            if (data.data && Array.isArray(data.data)) {
                setGifs(data.data);
            } else {
                setGifs([]);
            }
        } catch (e: any) {
            console.error("GIPHY error:", e);
            setError(e.message || "Failed to load GIFs");
            setGifs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGifs('trending');
    }, []);

    useEffect(() => {
        if (!query.trim()) return;
        const timer = setTimeout(() => fetchGifs('search', query), 400);
        return () => clearTimeout(timer);
    }, [query]);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
            <div className="bg-gray-900 border border-green-500/30 rounded-t-xl md:rounded-xl w-full max-w-md max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-3 border-b border-green-500/20">
                    <span className="font-mono text-green-400 text-sm">GIPHY</span>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-3">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search GIFs..."
                        className="w-full bg-black border border-green-500/30 rounded px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60"
                        autoFocus
                    />
                </div>
                <div className="flex-1 overflow-y-auto p-3 pt-0 min-h-[200px]">
                    {!apiKey ? (
                        <div className="text-center py-8">
                            <p className="text-red-400 font-mono text-sm mb-2">API Key Missing</p>
                            <p className="text-gray-500 font-mono text-xs">Add VITE_GIPHY_API_KEY to .env</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-8">
                            <p className="text-red-400 font-mono text-sm mb-2">{error}</p>
                            <button
                                onClick={() => fetchGifs('trending')}
                                className="text-green-400 font-mono text-xs hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : loading ? (
                        <div className="text-center text-gray-600 font-mono py-8 animate-pulse">loading...</div>
                    ) : gifs.length === 0 ? (
                        <div className="text-center text-gray-600 font-mono py-8">
                            {query ? 'No GIFs found' : 'No trending GIFs'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {gifs.map((gif) => (
                                <button
                                    key={gif.id}
                                    onClick={() => onSelect(gif.images.fixed_height.url, gif.id)}
                                    className="rounded overflow-hidden border border-transparent hover:border-green-500/50 transition-colors"
                                >
                                    <img
                                        src={gif.images.fixed_height_small.url}
                                        alt={gif.title || "GIF"}
                                        className="w-full h-24 object-cover bg-gray-800"
                                        loading="lazy"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-2 border-t border-green-500/20 text-center">
                    <span className="font-mono text-[10px] text-gray-600">Powered by GIPHY</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// MEDIA PICKER (Bottom Sheet / Modal)
// ============================================================================
interface MediaPickerProps {
    onClose: () => void;
    onSelectMedia: (file: File) => void;
    onGif: () => void;
    onVoice: () => void;
    isMobile: boolean;
}

function MediaPicker({ onClose, onSelectMedia, onGif, onVoice, isMobile }: MediaPickerProps) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onSelectMedia(file);
            onClose();
        }
    };

    const content = (
        <div className="space-y-2">
            <input type="file" ref={imageInputRef} accept="image/*" onChange={handleFileSelect} className="hidden" />
            <input type="file" ref={videoInputRef} accept="video/*" onChange={handleFileSelect} className="hidden" />
            <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />

            <button onClick={() => imageInputRef.current?.click()} className="w-full flex items-center gap-3 p-4 rounded-lg border border-green-500/30 hover:bg-green-500/10 text-green-400">
                <Image className="w-5 h-5" />
                <span className="font-mono text-sm">Send Image</span>
            </button>

            <button onClick={() => videoInputRef.current?.click()} className="w-full flex items-center gap-3 p-4 rounded-lg border border-green-500/30 hover:bg-green-500/10 text-green-400">
                <Film className="w-5 h-5" />
                <span className="font-mono text-sm">Send Video</span>
            </button>

            {isMobile && (
                <button onClick={() => cameraInputRef.current?.click()} className="w-full flex items-center gap-3 p-4 rounded-lg border border-green-500/30 hover:bg-green-500/10 text-green-400">
                    <Camera className="w-5 h-5" />
                    <span className="font-mono text-sm">Take Photo</span>
                </button>
            )}

            <button onClick={onGif} className="w-full flex items-center gap-3 p-4 rounded-lg border border-green-500/30 hover:bg-green-500/10 text-green-400">
                <Smile className="w-5 h-5" />
                <span className="font-mono text-sm">Send GIF</span>
            </button>

            <button onClick={onVoice} className="w-full flex items-center gap-3 p-4 rounded-lg border border-green-500/30 hover:bg-green-500/10 text-green-400">
                <Mic className="w-5 h-5" />
                <span className="font-mono text-sm">Voice Message</span>
            </button>
        </div>
    );

    if (isMobile) {
        return (
            <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose}>
                <div className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-green-500/30 rounded-t-2xl p-4 pb-8" onClick={e => e.stopPropagation()}>
                    <div className="w-12 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
                    {content}
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-gray-900 border border-green-500/30 rounded-xl w-full max-w-xs p-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-green-400 text-sm">SEND MEDIA</span>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-400"><X className="w-5 h-5" /></button>
                </div>
                {content}
            </div>
        </div>
    );
}

// ============================================================================
// VOICE RECORDER
// ============================================================================
interface VoiceRecorderProps {
    isMobile: boolean;
    onSend: (url: string, duration: number) => void;
    onCancel: () => void;
    uploadVoice: (blob: Blob) => Promise<string | null>;
}

function VoiceRecorder({ isMobile, onSend, onCancel, uploadVoice }: VoiceRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const isCancelledRef = useRef(false);
    const durationRef = useRef(0);

    const cleanup = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsRecording(false);
    };

    const startRecording = async () => {
        setError(null);
        isCancelledRef.current = false;

        // Check if mediaDevices is available (requires HTTPS on mobile)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setError("Microphone not available. Use HTTPS or a supported browser.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
            });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                cleanup();

                if (isCancelledRef.current) {
                    return;
                }

                if (audioChunksRef.current.length > 0) {
                    setUploading(true);
                    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    const url = await uploadVoice(blob);
                    setUploading(false);
                    if (url) {
                        onSend(url, durationRef.current);
                    } else {
                        setError("Upload failed");
                    }
                }
            };

            mediaRecorder.start(100); // Collect data every 100ms
            setIsRecording(true);
            setDuration(0);
            durationRef.current = 0;

            intervalRef.current = setInterval(() => {
                durationRef.current += 1;
                setDuration(durationRef.current);
                if (durationRef.current >= 60) {
                    stopRecording();
                }
            }, 1000);

        } catch (err: any) {
            console.error("Mic error:", err);
            setError(err.message || "Cannot access microphone");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const cancelRecording = () => {
        isCancelledRef.current = true;
        stopRecording();
        cleanup();
        onCancel();
    };

    // Mobile: Hold-to-record
    const handlePointerDown = () => {
        if (!isRecording) {
            startRecording();
        }
    };

    const handlePointerUp = () => {
        if (isRecording) {
            stopRecording();
        }
    };

    if (isMobile) {
        return (
            <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
                <div className="text-center px-4">
                    {error && <p className="text-red-400 font-mono text-sm mb-4">{error}</p>}
                    {uploading && <p className="text-yellow-400 font-mono text-sm mb-4 animate-pulse">Uploading...</p>}
                    <div
                        onPointerDown={handlePointerDown}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        className={`w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-4 transition-all cursor-pointer select-none ${isRecording
                            ? 'bg-red-500 scale-110'
                            : 'bg-green-500/20 border-2 border-green-500 hover:bg-green-500/30'
                            }`}
                        style={{ touchAction: 'none' }}
                    >
                        <Mic className={`w-12 h-12 ${isRecording ? 'text-white animate-pulse' : 'text-green-400'}`} />
                    </div>
                    <p className="font-mono text-xl text-white mb-2">
                        {isRecording ? `${duration}s` : 'Hold to record'}
                    </p>
                    <p className="font-mono text-xs text-gray-500 mb-6">
                        {isRecording ? 'Release to send' : 'Up to 60 seconds'}
                    </p>
                    <button onClick={cancelRecording} className="text-gray-400 font-mono text-sm hover:text-red-400">
                        [cancel]
                    </button>
                </div>
            </div>
        );
    }

    // Web: Click-based
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={onCancel}>
            <div className="bg-gray-900 border border-green-500/30 rounded-xl p-6 w-80" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-green-400">VOICE MESSAGE</span>
                    <button onClick={cancelRecording} className="text-gray-500 hover:text-red-400"><X className="w-5 h-5" /></button>
                </div>

                {error && <p className="text-red-400 font-mono text-sm mb-4">{error}</p>}
                {uploading && <p className="text-yellow-400 font-mono text-sm mb-4 animate-pulse">Uploading...</p>}

                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={uploading}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isRecording
                            ? 'bg-red-500 animate-pulse'
                            : 'bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500'
                            }`}
                    >
                        <Mic className={`w-8 h-8 ${isRecording ? 'text-white' : 'text-green-400'}`} />
                    </button>
                </div>

                <p className="text-center font-mono text-lg text-white mt-4">
                    {isRecording ? `Recording: ${duration}s` : 'Click to record'}
                </p>
                <p className="text-center font-mono text-xs text-gray-500 mt-1">
                    {isRecording ? 'Click again to stop' : 'Up to 60 seconds'}
                </p>
            </div>
        </div>
    );
}

// ============================================================================
// SESSION VIEW
// ============================================================================
interface SessionViewProps {
    sessionId: string;
    onBack: () => void;
    isMobile: boolean;
}

function SessionView({ sessionId, onBack, isMobile }: SessionViewProps) {
    const { user } = useAuth();
    const { messages, loading, otherUser, myMaskedAlias, uploading, sendMessage, uploadMedia, uploadVoice } = useSessionMessages(sessionId);
    const { deleteSession } = useSessions();
    const [inputText, setInputText] = useState("");
    const [useMask, setUseMask] = useState(false);
    const [sending, setSending] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [showGiphy, setShowGiphy] = useState(false);
    const [showVoice, setShowVoice] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [myUsername, setMyUsername] = useState('you');
    useEffect(() => {
        if (user?.id) {
            (async () => {
                const { data } = await (await import('@/lib/supabase')).supabase.from('profiles').select('username, role').eq('id', user.id).single();
                if (data?.username) setMyUsername(data.username);
                if (data?.role === 'admin') setIsAdmin(true);
            })();
        }
    }, [user?.id]);

    const handleDeleteChat = async () => {
        const success = await deleteSession(sessionId);
        if (success) onBack();
        setShowDeleteConfirm(false);
    };

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim() || sending) return;
        setSending(true);
        await sendMessage(inputText.trim(), { useMask });
        setInputText("");
        setSending(false);
    };

    const handleMediaSelect = async (file: File) => {
        const result = await uploadMedia(file);
        if (result) {
            await sendMessage("", { useMask, mediaUrl: result.url, mediaType: result.type });
        }
    };

    const handleGifSelect = async (url: string, id: string) => {
        setShowGiphy(false);
        await sendMessage("", { useMask, gifUrl: url, gifId: id });
    };

    const handleVoiceSend = async (url: string, duration: number) => {
        setShowVoice(false);
        await sendMessage("", { useMask, voiceUrl: url, voiceDuration: duration });
    };

    return (
        <div className={`flex flex-col bg-black ${isMobile ? 'h-[100dvh]' : 'h-full'}`}>
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-gray-900 border border-red-500/50 rounded-xl p-5 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-red-400 font-mono text-lg mb-2">Delete Chat</h3>
                        <p className="text-gray-400 text-sm font-mono mb-4">
                            This will permanently delete this chat and all messages for BOTH users. This cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-gray-400 hover:text-gray-200 font-mono text-sm">Cancel</button>
                            <button onClick={handleDeleteChat} className="px-3 py-1.5 bg-red-600 text-white font-mono text-sm rounded hover:bg-red-500">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-green-500/30 flex-shrink-0">
                <button onClick={onBack} className="text-green-400 hover:text-green-300 p-1"><ArrowLeft className="w-5 h-5" /></button>
                <div className="w-8 h-8 rounded-full bg-black border border-green-500/40 flex items-center justify-center">
                    {otherUser?.avatar_url ? <img src={otherUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-green-400 font-mono text-sm">{otherUser?.username?.[0]?.toUpperCase() || '?'}</span>}
                </div>
                <span className="font-mono text-green-400 text-sm flex-1">@{otherUser?.username || 'unknown'}</span>
                {isAdmin && (
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete chat (Admin)"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto p-3 ${isMobile ? 'max-h-[75dvh]' : ''}`}>
                {loading ? (
                    <div className="text-center text-gray-600 font-mono py-4 animate-pulse">loading...</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-600 font-mono py-8"><p className="text-sm">[session started]</p></div>
                ) : (
                    <div className="space-y-0.5">
                        {messages.map((msg) => (
                            <LogMessage key={msg.id} message={msg} isSent={msg.sender_id === user?.id} myUsername={myUsername} otherUsername={otherUser?.username || 'user'} />
                        ))}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-green-500/30 bg-black p-3">
                <div className="flex items-center justify-between mb-2 text-[10px] font-mono">
                    <button onClick={() => setUseMask(!useMask)} className={useMask ? 'text-purple-400' : 'text-gray-600'}>
                        {useMask ? `🎭 ${myMaskedAlias}` : '👤 visible'}
                    </button>
                    {uploading && <span className="text-yellow-500 animate-pulse">uploading...</span>}
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setShowPicker(true)} className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 hover:bg-green-500/30">
                        <Plus className="w-4 h-4" />
                    </button>

                    <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-green-500/30 rounded-lg px-3 py-2">
                        <span className={`font-mono text-sm ${useMask ? 'text-purple-500' : 'text-green-600'}`}>{'>'}</span>
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="message..."
                            className="flex-1 bg-transparent text-gray-100 placeholder-gray-600 focus:outline-none font-mono text-sm"
                        />
                    </div>

                    <button onClick={handleSend} disabled={sending || !inputText.trim()} className="p-2 text-green-500 hover:text-green-400 disabled:text-gray-700">
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Modals */}
            {showPicker && (
                <MediaPicker
                    onClose={() => setShowPicker(false)}
                    onSelectMedia={handleMediaSelect}
                    onGif={() => { setShowPicker(false); setShowGiphy(true); }}
                    onVoice={() => { setShowPicker(false); setShowVoice(true); }}
                    isMobile={isMobile}
                />
            )}
            {showGiphy && <GiphyPicker onSelect={handleGifSelect} onClose={() => setShowGiphy(false)} />}
            {showVoice && <VoiceRecorder isMobile={isMobile} onSend={handleVoiceSend} onCancel={() => setShowVoice(false)} uploadVoice={uploadVoice} />}
        </div>
    );
}

// ============================================================================
// SESSION ITEM
// ============================================================================
function SessionItem({ session, onClick }: { session: Session; onClick: () => void }) {
    const { other_user, last_message, unread_count, status } = session;
    return (
        <button onClick={onClick} className="w-full flex items-center gap-3 p-3 border-b border-green-900/30 hover:bg-green-500/5 transition-colors text-left">
            <div className="relative w-10 h-10 rounded-full bg-black border border-green-500/40 flex items-center justify-center flex-shrink-0">
                {other_user?.avatar_url ? <img src={other_user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-green-400 font-mono">{other_user?.username?.[0]?.toUpperCase() || '?'}</span>}
                {unread_count && unread_count > 0 && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className={`font-mono text-sm ${unread_count ? 'text-green-400' : 'text-gray-300'}`}>@{other_user?.username || 'unknown'}</div>
                {last_message && <div className="font-mono text-[10px] text-gray-600 truncate">{last_message.content || '[media]'}</div>}
            </div>
            {status === 'archived' && <span className="font-mono text-[9px] text-gray-600 bg-gray-800 px-1 py-0.5 rounded">ARCHIVED</span>}
            <span className="font-mono text-gray-600">›</span>
        </button>
    );
}

// ============================================================================
// INBOX VIEW
// ============================================================================
function InboxView({ onSelectSession, onClose, isMobile }: { onSelectSession: (id: string) => void; onClose: () => void; isMobile: boolean }) {
    const { activeSessions, archivedSessions, loading } = useSessions();
    const [tab, setTab] = useState<'active' | 'archived'>('active');
    const sessions = tab === 'active' ? activeSessions : archivedSessions;

    return (
        <div className={`flex flex-col bg-black ${isMobile ? 'h-[100dvh]' : 'h-full'}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-green-500/30 flex-shrink-0">
                <div className="flex items-center gap-2 font-mono"><MessageCircle className="w-5 h-5 text-green-500" /><span className="text-green-400 font-bold">SESSIONS</span></div>
                <button onClick={onClose} className="text-gray-500 hover:text-red-400 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex border-b border-green-900/30 flex-shrink-0">
                <button onClick={() => setTab('active')} className={`flex-1 py-2 px-4 font-mono text-sm ${tab === 'active' ? 'text-green-400 bg-green-500/10 border-b border-green-500' : 'text-gray-500'}`}>Active ({activeSessions.length})</button>
                <button onClick={() => setTab('archived')} className={`flex-1 py-2 px-4 font-mono text-sm ${tab === 'archived' ? 'text-green-400 bg-green-500/10 border-b border-green-500' : 'text-gray-500'}`}>Archived ({archivedSessions.length})</button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {loading ? <div className="text-center text-gray-600 font-mono py-8 animate-pulse">loading...</div> : sessions.length === 0 ? <div className="text-center text-gray-600 font-mono py-12"><p>[no sessions]</p></div> : sessions.map((s) => <SessionItem key={s.id} session={s} onClick={() => onSelectSession(s.id)} />)}
            </div>
        </div>
    );
}

// ============================================================================
// GUEST BLOCKER
// ============================================================================
function GuestBlocker({ onClose }: { onClose: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-black p-8">
            <MessageCircle className="w-12 h-12 text-red-500/50 mb-4" />
            <h2 className="font-mono text-red-400 text-lg mb-2">ACCESS DENIED</h2>
            <p className="font-mono text-gray-500 text-sm mb-6 text-center">Registered users only.</p>
            <div className="flex gap-3">
                <Link to="/login" onClick={onClose} className="px-4 py-2 bg-green-600 text-black font-mono text-sm rounded">Login</Link>
                <Link to="/register" onClick={onClose} className="px-4 py-2 border border-green-500/50 text-green-400 font-mono text-sm rounded">Register</Link>
            </div>
            <button onClick={onClose} className="mt-6 text-gray-600 font-mono text-xs">[close]</button>
        </div>
    );
}

// ============================================================================
// MAIN PANEL
// ============================================================================
export default function MessagingPanel({ initialSessionId, onSessionOpened }: { initialSessionId?: string; onSessionOpened?: () => void }) {
    const { user } = useAuth();
    const { totalUnread } = useSessions();
    const { isMobile } = useDeviceDetect();
    const [isOpen, setIsOpen] = useState(false);
    const [activeSession, setActiveSession] = useState<string | null>(initialSessionId || null);

    useEffect(() => {
        if (initialSessionId) { setActiveSession(initialSessionId); setIsOpen(true); onSessionOpened?.(); }
    }, [initialSessionId, onSessionOpened]);

    const handleClose = () => { setIsOpen(false); setActiveSession(null); };

    const containerClasses = isMobile
        ? `fixed inset-0 z-50 transform transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
        : `fixed top-0 right-0 h-full w-[380px] border-l border-green-500/30 z-50 transform transition-transform duration-300 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`;

    return (
        <>
            {isOpen && !isMobile && <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />}
            <div className={containerClasses}>
                {!user ? <GuestBlocker onClose={handleClose} /> : activeSession ? <SessionView sessionId={activeSession} onBack={() => setActiveSession(null)} isMobile={isMobile} /> : <InboxView onSelectSession={setActiveSession} onClose={handleClose} isMobile={isMobile} />}
            </div>
            <button onClick={() => setIsOpen(!isOpen)} className={`fixed ${isMobile ? 'bottom-4 right-4' : 'bottom-6 right-6'} z-50 w-12 h-12 rounded-full flex items-center justify-center bg-black border border-green-500/50 hover:border-green-400 transition-all ${isOpen ? 'opacity-0 pointer-events-none' : ''}`}>
                <MessageCircle className="w-5 h-5 text-green-400" />
                {totalUnread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-mono">{totalUnread}</span>}
            </button>
        </>
    );
}

export { MessagingPanel };
