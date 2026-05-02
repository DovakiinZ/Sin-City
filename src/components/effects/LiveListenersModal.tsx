import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Music, Headphones, X } from "lucide-react";
import { Link } from "react-router-dom";

interface Listener {
    id: string;
    username: string;
    avatar_url: string | null;
    spotify_status: any;
}

interface LiveListenersModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LiveListenersModal({ isOpen, onClose }: LiveListenersModalProps) {
    const [listeners, setListeners] = useState<Listener[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;

        const fetchListeners = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, spotify_status')
                    .not('spotify_status', 'is', null);

                if (error) throw error;

                if (data) {
                    // Filter for active listeners only
                    const activeListeners = data.filter(p => p.spotify_status && p.spotify_status.is_playing);
                    setListeners(activeListeners);
                }
            } catch (err) {
                console.error("Error fetching live listeners:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchListeners();
        
        // Optional: Poll every 30 seconds while open
        const interval = setInterval(fetchListeners, 30000);
        return () => clearInterval(interval);
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-black border border-green-900/50 text-green-500 max-w-md w-[90%] p-0 overflow-hidden shadow-2xl shadow-green-900/20">
                <DialogHeader className="p-4 border-b border-green-900/50 bg-black/60 relative">
                    <DialogTitle className="flex items-center gap-2 font-mono text-sm tracking-wider uppercase text-green-400">
                        <Headphones className="w-4 h-4" />
                        Live Listeners
                    </DialogTitle>
                    <button 
                        onClick={onClose}
                        className="absolute right-4 top-4 text-green-700 hover:text-green-400 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </DialogHeader>

                <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center p-8">
                            <Music className="w-6 h-6 animate-pulse text-green-600" />
                        </div>
                    ) : listeners.length > 0 ? (
                        <div className="space-y-4">
                            {listeners.map(listener => (
                                <div key={listener.id} className="flex items-center gap-3 bg-green-950/10 border border-green-900/30 p-3 rounded-lg hover:bg-green-950/30 transition-colors">
                                    <Link to={`/profile/${listener.username}`} className="shrink-0" onClick={onClose}>
                                        {listener.avatar_url ? (
                                            <img src={listener.avatar_url} alt={listener.username} className="w-10 h-10 rounded-full object-cover border border-green-800/50" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-green-900/30 border border-green-800/50 flex items-center justify-center text-green-500 font-bold uppercase">
                                                {listener.username.charAt(0)}
                                            </div>
                                        )}
                                    </Link>
                                    <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                                        <div className="flex flex-col truncate">
                                            <Link to={`/profile/${listener.username}`} className="text-sm font-bold text-green-400 hover:underline truncate" onClick={onClose}>
                                                @{listener.username}
                                            </Link>
                                            <span className="text-xs text-green-500/70 truncate">
                                                Listening to <span className="text-green-300 font-medium">{listener.spotify_status.song}</span>
                                            </span>
                                            <span className="text-[10px] text-green-600 truncate">
                                                by {listener.spotify_status.artist}
                                            </span>
                                        </div>
                                        {listener.spotify_status.album_art_url ? (
                                            <img src={listener.spotify_status.album_art_url} alt="Album Art" className="w-10 h-10 rounded shadow-sm shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 rounded bg-green-950/50 flex items-center justify-center shrink-0">
                                                <Music className="w-4 h-4 text-green-700" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-8 flex flex-col items-center justify-center text-green-800">
                            <Headphones className="w-8 h-8 mb-2 opacity-50" />
                            <p className="text-sm">Nobody is currently broadcasting Spotify.</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
