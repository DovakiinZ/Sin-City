import { useState, useEffect } from "react";
import { Music as MusicIcon, ExternalLink } from "lucide-react";

interface MusicEmbedProps {
    url: string;
    compact?: boolean;
}

const MusicEmbed = ({ url, compact = false }: MusicEmbedProps) => {
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [platform, setPlatform] = useState<'spotify' | 'youtube' | 'other'>('other');

    useEffect(() => {
        if (!url) return;

        // Process Spotify URLs
        if (url.includes('spotify.com')) {
            setPlatform('spotify');
            // Extract type and ID
            // Handles:
            // https://open.spotify.com/track/ID
            // https://open.spotify.com/intl-pt/track/ID
            const match = url.match(/spotify\.com\/.*?(track|album|playlist|artist)\/([a-zA-Z0-9]+)/);
            if (match) {
                const [_, type, id] = match;
                setEmbedUrl(`https://open.spotify.com/embed/${type}/${id}`);
            }
        }
        // Process YouTube URLs
        else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            setPlatform('youtube');
            try {
                let videoId = '';

                // Handle youtu.be/ID
                if (url.includes('youtu.be')) {
                    videoId = url.split('youtu.be/')[1]?.split(/[?#]/)[0] || '';
                }
                // Handle youtube.com/embed/ID
                else if (url.includes('/embed/')) {
                    videoId = url.split('/embed/')[1]?.split(/[?#]/)[0] || '';
                }
                // Handle youtube.com/shorts/ID
                else if (url.includes('/shorts/')) {
                    videoId = url.split('/shorts/')[1]?.split(/[?#]/)[0] || '';
                }
                // Handle youtube.com/live/ID
                else if (url.includes('/live/')) {
                    videoId = url.split('/live/')[1]?.split(/[?#]/)[0] || '';
                }
                // Handle standard watch?v=ID (works for music.youtube.com too)
                else {
                    // Robust extraction for v= parameter
                    // We don't rely solely on URL constructor which might fail on partial input
                    const vMatch = url.match(/[?&]v=([^&#]+)/);
                    if (vMatch) {
                        videoId = vMatch[1];
                    }
                }

                if (videoId) {
                    setEmbedUrl(`https://www.youtube.com/embed/${videoId}`);
                } else {
                    console.warn('MusicEmbed: Could not extract YouTube ID from:', url);
                }
            } catch (e) {
                console.error('MusicEmbed: Error parsing YouTube URL:', e);
            }
        }
    }, [url]);

    if (!embedUrl) {
        return (
            <div className="flex items-center gap-2 p-2 border border-green-800 bg-black/50 text-xs ascii-dim">
                <MusicIcon className="w-4 h-4" />
                <a href={url} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
                    Wait... Is that a song? (Invalid or unsupported link)
                    <ExternalLink className="w-3 h-3" />
                </a>
            </div>
        );
    }

    return (
        <div className={`w-full ${compact ? 'max-w-md' : 'max-w-full'} my-2`}>
            {platform === 'spotify' ? (
                <iframe
                    style={{ borderRadius: '12px' }}
                    src={embedUrl}
                    width="100%"
                    height={compact ? "80" : "152"}
                    allowFullScreen
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="bg-black/20"
                />
            ) : (
                <div className="relative aspect-video border border-green-900 rounded overflow-hidden">
                    <iframe
                        width="100%"
                        height="100%"
                        src={embedUrl}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                </div>
            )}
        </div>
    );
};

export default MusicEmbed;
