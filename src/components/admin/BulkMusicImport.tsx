import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Music, AlertCircle, Check, X, Loader2 } from "lucide-react";
import { useMusicLinks, validateMusicUrl } from "@/hooks/useMusicLinks";

interface ScannedSong {
    url: string;
    platform: "Spotify" | "YouTube Music";
    title: string;
    originalIndex: number; // to keep stable order if needed
}

export function BulkMusicImport({ onComplete }: { onComplete: () => void }) {
    const { addMusicLink } = useMusicLinks();
    const [text, setText] = useState("");
    const [scannedSongs, setScannedSongs] = useState<ScannedSong[]>([]);
    const [mood, setMood] = useState<'sad' | 'happy' | 'bored' | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const scanText = async () => {
        setIsScanning(true);
        const songs: ScannedSong[] = [];

        // Global regex for URLs (simple detection first)
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = text.match(urlRegex) || [];

        for (let i = 0; i < matches.length; i++) {
            const url = matches[i];
            const validation = validateMusicUrl(url);

            if (validation.valid && validation.platform) {
                // Try to guess title or fetch it (placeholder for now)
                // For now, simple fallback
                let title = `Song ${i + 1}`;

                // Very basic OEmbed extraction attempt (often fails due to CORS, but worth a try if backend proxy existed)
                // Since we are client-side only, we will use efficient fallbacks or simple text parsing if possible.
                // For now, we will just use a generic title and let user edit.

                songs.push({
                    url,
                    platform: validation.platform,
                    title: "", // Empty title prompts user to fill it or we can auto-fill generic
                    originalIndex: i
                });
            }
        }

        setScannedSongs(songs);
        setIsScanning(false);
    };

    const handleImport = async () => {
        setIsImporting(true);
        let successCount = 0;

        for (const song of scannedSongs) {
            // Use a default title if empty
            const titleToUse = song.title.trim() || `${song.platform} Song`;
            const success = await addMusicLink(song.platform, song.url, titleToUse, mood);
            if (success) successCount++;
        }

        setIsImporting(false);
        if (successCount > 0) {
            setText("");
            setScannedSongs([]);
            onComplete();
        }
    };

    const removeSong = (index: number) => {
        setScannedSongs(prev => prev.filter((_, i) => i !== index));
    };

    const updateSongTitle = (index: number, newTitle: string) => {
        setScannedSongs(prev => prev.map((s, i) => i === index ? { ...s, title: newTitle } : s));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <Music className="w-5 h-5 ascii-highlight" />
                <h3 className="ascii-highlight text-lg">BULK IMPORT</h3>
            </div>

            <p className="ascii-dim text-xs">
                Paste a list of links (chat logs, playlists, text files). We'll find the songs.
            </p>

            <div className="space-y-2">
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste text containing Spotify/YouTube links here..."
                    className="bg-black/30 border-ascii-border ascii-text min-h-[150px] font-mono text-xs"
                />

                {scannedSongs.length === 0 && (
                    <Button
                        onClick={scanText}
                        disabled={!text.trim() || isScanning}
                        className="w-full bg-ascii-highlight text-black hover:bg-ascii-highlight/80"
                    >
                        {isScanning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                        Scan for Links
                    </Button>
                )}
            </div>

            {scannedSongs.length > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="ascii-box p-3 bg-blue-900/10 border-blue-500/30">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-blue-400 text-xs font-bold">FOUND {scannedSongs.length} SONGS</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setScannedSongs([])}
                                className="h-6 text-xs text-red-400 hover:text-red-300"
                            >
                                Clear All
                            </Button>
                        </div>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {scannedSongs.map((song, idx) => (
                                <div key={idx} className="flex gap-2 items-start group">
                                    <div className={`mt-2 w-2 h-2 rounded-full ${song.platform === 'Spotify' ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <div className="flex-1 space-y-1">
                                        <Input
                                            value={song.title}
                                            onChange={(e) => updateSongTitle(idx, e.target.value)}
                                            placeholder="Enter Title..."
                                            className="h-7 text-xs bg-black/50 border-ascii-border"
                                        />
                                        <div className="text-[10px] ascii-dim truncate">{song.url}</div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeSong(idx)}
                                        className="h-7 w-7 p-0 text-ascii-dim hover:text-red-400"
                                    >
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="ascii-dim text-xs block">Apply Mood to All</label>
                        <div className="flex gap-2">
                            {(['sad', 'happy', 'bored'] as const).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMood(mood === m ? null : m)}
                                    className={`px-3 py-1 text-xs border flex-1 transition-all ${mood === m
                                            ? 'bg-ascii-highlight text-black border-ascii-highlight font-bold'
                                            : 'border-ascii-border ascii-text hover:bg-white/10'
                                        }`}
                                >
                                    {m.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Button
                        onClick={handleImport}
                        disabled={isImporting}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Importing...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4 mr-2" /> Import {scannedSongs.length} Songs
                            </>
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}

// Helper icon import (was missing in original import list)
import { Plus } from "lucide-react";
