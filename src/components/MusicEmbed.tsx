import { useState, useEffect } from "react";
import { Music as MusicIcon, ExternalLink, Play } from "lucide-react";
import MusicCard, { MusicMetadata } from "./MusicCard";

interface MusicEmbedProps {
    url: string;
    compact?: boolean;
    metadata?: MusicMetadata | null;
}

/**
 * Music embed component with smart fallback.
 * - With metadata: Shows MusicCard (always works)
 * - Without metadata for Spotify: Shows Spotify embed (usually works)  
 * - Without metadata for YouTube: Shows link card (embeds often fail)
 * - Without metadata for Apple: Shows link card
 */
const MusicEmbed = ({ url, compact = false, metadata }: MusicEmbedProps) => {
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [platform, setPlatform] = useState<'spotify' | 'youtube' | 'apple' | 'other'>('other');
    const [showEmbed, setShowEmbed] = useState(false);

    useEffect(() => {
        if (!url) return;

        // Reset on URL change
        setShowEmbed(false);

        // Determine platform from URL
        if (url.includes('spotify.com')) {
            setPlatform('spotify');
            // Handle intl paths like /intl-pt/track/ID
            const match = url.match(/spotify\.com\/.*?(track|album|playlist|artist)\/([a-zA-Z0-9]+)/);
            if (match) {
                const [, type, id] = match;
                setEmbedUrl(`https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`);
            }
        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            setPlatform('youtube');
            // Only set embed URL if we have metadata (safer)
            if (metadata?.embed_url) {
                setEmbedUrl(metadata.embed_url);
            } else {
                // Extract video ID but don't auto-embed (too many failures)
                let videoId = '';
                if (url.includes('youtu.be')) {
                    videoId = url.split('/').pop()?.split('?')[0] || '';
                } else {
                    try {
                        const urlParams = new URL(url).searchParams;
                        videoId = urlParams.get('v') || '';
                    } catch {
                        // URL parsing failed
                    }
                }
                if (videoId) {
                    setEmbedUrl(`https://www.youtube.com/embed/${videoId}`);
                }
            }
        } else if (url.includes('music.apple.com')) {
            setPlatform('apple');
            if (metadata?.embed_url) {
                setEmbedUrl(metadata.embed_url);
            }
        }
    }, [url, metadata]);

    // Platform colors for styling
    const platformConfig = {
        spotify: { color: 'text-green-500', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', label: 'Spotify' },
        youtube: { color: 'text-red-500', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', label: 'YouTube Music' },
        apple: { color: 'text-pink-500', bgColor: 'bg-pink-500/10', borderColor: 'border-pink-500/30', label: 'Apple Music' },
        other: { color: 'text-gray-500', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-500/30', label: 'Music' },
    };
    const config = platformConfig[platform];

    // Get embed height based on platform and compact mode
    const getEmbedHeight = () => {
        if (platform === 'spotify') return compact ? 80 : 152;
        if (platform === 'apple') return compact ? 80 : 175;
        return compact ? 160 : 315;
    };

    // If we have metadata, show the MusicCard (always reliable)
    if (metadata) {
        return (
            <div className={`w-full ${compact ? 'max-w-md' : 'max-w-lg'} my-2`}>
                {/* Show embed only for Spotify (most reliable) when requested */}
                {showEmbed && embedUrl && platform === 'spotify' && (
                    <div className="mb-2">
                        <iframe
                            style={{ borderRadius: '12px' }}
                            src={embedUrl}
                            width="100%"
                            height={getEmbedHeight()}
                            allowFullScreen
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            loading="lazy"
                            className="bg-black/20"
                        />
                    </div>
                )}

                {/* Always show the card as a reliable fallback */}
                <MusicCard metadata={metadata} compact={compact} />

                {/* Play inline button for Spotify only */}
                {embedUrl && !showEmbed && platform === 'spotify' && (
                    <button
                        onClick={() => setShowEmbed(true)}
                        className="mt-2 flex items-center gap-1.5 text-xs text-green-500 hover:text-green-400"
                    >
                        <Play className="w-3 h-3" />
                        Play preview
                    </button>
                )}
            </div>
        );
    }

    // NO METADATA - show platform-specific handling

    // Spotify without metadata: Try embedding (usually works)
    if (platform === 'spotify' && embedUrl) {
        return (
            <div className={`w-full ${compact ? 'max-w-md' : 'max-w-full'} my-2`}>
                <iframe
                    style={{ borderRadius: '12px' }}
                    src={embedUrl}
                    width="100%"
                    height={getEmbedHeight()}
                    allowFullScreen
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="bg-black/20"
                />
            </div>
        );
    }

    // YouTube/Apple/Other without metadata: Show clickable link card (safe fallback)
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 p-3 ${config.bgColor} border ${config.borderColor} rounded-lg hover:opacity-80 transition-opacity max-w-md`}
        >
            <div className={`w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                <MusicIcon className={`w-6 h-6 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-100 text-sm">{config.label}</div>
                <div className="text-xs text-gray-500 truncate">{url.substring(0, 40)}...</div>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0" />
        </a>
    );
};

export default MusicEmbed;
