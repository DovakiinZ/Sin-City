import { useState, useEffect } from "react";
import { X, Search } from "lucide-react";

interface GifPickerProps {
    onSelect: (url: string, id: string) => void;
    onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
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
            <div className="bg-gray-900 border border-green-500/30 rounded-t-xl md:rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-green-500/20">
                    <span className="font-mono text-green-400 text-sm font-bold">GIF</span>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-green-500/10">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search GIFs..."
                            className="w-full bg-black border border-green-500/30 rounded-lg pl-10 pr-4 py-2.5 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60"
                            autoFocus
                        />
                    </div>
                </div>

                {/* GIF Grid */}
                <div className="flex-1 overflow-y-auto p-3 min-h-[250px]">
                    {!apiKey ? (
                        <div className="text-center py-12">
                            <p className="text-red-400 font-mono text-sm mb-2">API Key Missing</p>
                            <p className="text-gray-500 font-mono text-xs">Add VITE_GIPHY_API_KEY to .env</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-red-400 font-mono text-sm mb-2">{error}</p>
                            <button
                                onClick={() => fetchGifs('trending')}
                                className="text-green-400 font-mono text-xs hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : loading ? (
                        <div className="text-center text-gray-600 font-mono py-12 animate-pulse">loading...</div>
                    ) : gifs.length === 0 ? (
                        <div className="text-center text-gray-600 font-mono py-12">
                            {query ? 'No GIFs found' : 'No trending GIFs'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {gifs.map((gif) => (
                                <button
                                    key={gif.id}
                                    onClick={() => onSelect(gif.images.fixed_height.url, gif.id)}
                                    className="rounded-lg overflow-hidden border-2 border-transparent hover:border-green-500/50 transition-colors aspect-video bg-gray-800"
                                >
                                    <img
                                        src={gif.images.fixed_height_small.url}
                                        alt={gif.title || "GIF"}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-2 border-t border-green-500/20 text-center bg-black/50">
                    <span className="font-mono text-[10px] text-gray-600">Powered by GIPHY</span>
                </div>
            </div>
        </div>
    );
}
