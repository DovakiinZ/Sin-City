import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Send, Plus, X, Loader2, Mic, StopCircle, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PendingMedia {
    url: string;
    type: 'image' | 'video' | 'gif' | 'voice';
    file?: File;
    duration?: number;
    blob?: Blob;
}

interface ChatInputProps {
    onSend: (content: string, media?: PendingMedia) => void;
    onOpenMediaPicker: () => void;
    disabled?: boolean;
    placeholder?: string;
    pendingMedia?: PendingMedia | null;
    onClearMedia?: () => void;
    isUploading?: boolean;
    uploadVoice?: (blob: Blob) => Promise<string | null>;
}

export default function ChatInput({
    onSend,
    onOpenMediaPicker,
    disabled,
    placeholder = "Type a message...",
    pendingMedia,
    onClearMedia,
    isUploading,
    uploadVoice
}: ChatInputProps) {
    const [text, setText] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = async () => {
        if (disabled || isUploading) return;
        if (!text.trim() && !pendingMedia && !audioBlob) return;

        let finalMedia = pendingMedia || undefined;

        if (audioBlob && uploadVoice) {
            try {
                const voiceUrl = await uploadVoice(audioBlob);
                if (voiceUrl) {
                    finalMedia = {
                        url: voiceUrl,
                        type: 'voice',
                        duration: recordingDuration,
                        blob: audioBlob
                    };
                }
            } catch (error) {
                console.error("Voice upload failed:", error);
                return;
            }
        }

        onSend(text.trim(), finalMedia);
        setText("");
        setAudioBlob(null);
        setRecordingDuration(0);
        if (onClearMedia) onClearMedia();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize textarea
    const handleInput = () => {
        if (!inputRef.current) return;
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = Math.min(120, inputRef.current.scrollHeight) + 'px';
    };

    // Voice Recording Logic
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks: BlobPart[] = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                setAudioBlob(blob);
                const tracks = stream.getTracks();
                tracks.forEach(track => track.stop());
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
            setRecordingDuration(0);

            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error("Failed to start recording:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const cancelRecording = () => {
        setAudioBlob(null);
        setRecordingDuration(0);
        if (onClearMedia) onClearMedia();
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const canSend = (text.trim() || pendingMedia || audioBlob) && !disabled && !isUploading;

    return (
        <div className="border-t border-green-900/30 bg-black/80 backdrop-blur-sm safe-area-bottom">
            {/* Pending media/voice preview */}
            {(pendingMedia || audioBlob) && (
                <div className="px-3 pt-3 flex items-center gap-3">
                    {audioBlob ? (
                        <div className="flex items-center gap-3 bg-green-900/20 border border-green-900/50 rounded-full px-4 py-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            <span className="text-xs text-green-400 font-mono">Voice Note ({formatDuration(recordingDuration)})</span>
                            <button onClick={() => {
                                const url = URL.createObjectURL(audioBlob);
                                const audio = new Audio(url);
                                audio.play();
                            }} className="p-1 hover:text-green-300">
                                <Play className="w-4 h-4" />
                            </button>
                            <button onClick={cancelRecording} className="p-1 text-red-400 hover:text-red-300">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="relative inline-block">
                            {pendingMedia?.type === 'video' ? (
                                <video
                                    src={pendingMedia.url}
                                    className="h-20 w-20 object-cover rounded-lg border border-green-900/50"
                                />
                            ) : (
                                <img
                                    src={pendingMedia?.url}
                                    alt="Preview"
                                    className="h-20 w-20 object-cover rounded-lg border border-green-900/50"
                                />
                            )}
                            <button
                                onClick={onClearMedia}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                            >
                                <X className="w-3 h-3 text-white" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-end gap-2 p-3">
                {/* Media picker button */}
                <button
                    onClick={onOpenMediaPicker}
                    disabled={disabled || isUploading || isRecording}
                    className={cn(
                        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        "bg-green-900/40 text-green-400 hover:bg-green-900/60",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    {isUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Plus className="w-5 h-5" />
                    )}
                </button>

                {/* Text input or Recording UI */}
                <div className="flex-1 relative">
                    {isRecording ? (
                        <div className="flex items-center justify-between bg-green-900/20 border border-green-500/50 rounded-2xl px-4 py-2.5 h-[42px]">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-red-400 text-sm font-mono font-bold">REC</span>
                            </div>
                            <span className="text-green-400 font-mono text-sm">{formatDuration(recordingDuration)}</span>
                            <button onClick={stopRecording} className="text-red-500 hover:text-red-400">
                                <StopCircle className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <textarea
                            ref={inputRef}
                            value={text}
                            onChange={(e) => { setText(e.target.value); handleInput(); }}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            disabled={disabled || isUploading}
                            rows={1}
                            className={cn(
                                "w-full bg-gray-900/60 border border-green-900/40 rounded-2xl",
                                "px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500",
                                "focus:outline-none focus:border-green-500/50",
                                "resize-none overflow-hidden font-mono",
                                "disabled:opacity-50"
                            )}
                            style={{ maxHeight: '120px' }}
                        />
                    )}
                </div>

                {/* Voice Record / Send button */}
                {!text.trim() && !pendingMedia && !audioBlob && !isRecording ? (
                    <button
                        onClick={startRecording}
                        disabled={disabled || isUploading}
                        className={cn(
                            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                            "bg-green-900/40 text-green-400 hover:bg-green-900/60",
                            "disabled:opacity-50"
                        )}
                    >
                        <Mic className="w-5 h-5" />
                    </button>
                ) : (
                    <button
                        onClick={handleSend}
                        disabled={!canSend}
                        className={cn(
                            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                            canSend
                                ? "bg-green-600 text-black hover:bg-green-500"
                                : "bg-gray-800 text-gray-600 cursor-not-allowed"
                        )}
                    >
                        <Send className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
    );
}
