import { useState, useEffect } from "react";
import { Music as MusicIcon, Play } from "lucide-react";
import MusicCard, { MusicMetadata } from "./MusicCard";
import { extractYouTubeVideoId, getPrivacyEnhancedEmbedUrl, getYouTubeThumbnailUrl } from "@/utils/youtube";

interface MusicEmbedProps {
    url: string;
    compact?: boolean;
    metadata?: MusicMetadata | null;
}

/**
 * Music embed component with smart fallback and inline playback enforcement.
 * 
 * Strategy:
 * - Always show MusicCard as primary UI (reliable fallback)
 * - Spotify: Show embed directly (most reliable)
 * - YouTube: Show card + optional "Play inline" button (embeds can fail)
 * - Apple Music: Show card only (embeds unreliable)
 * - NO external redirects - all playback stays within Sin City
 */
const MusicEmbed = ({ url, compact = false, metadata }: MusicEmbedProps) => {
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [platform, setPlatform] = useState<'spotify' | 'youtube' | 'apple' | 'other'>('other');
    const [showEmbed, setShowEmbed] = useState(false);
    const [fallbackMetadata, setFallbackMetadata] = useState<MusicMetadata | null>(null);

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
                // Auto-show Spotify embeds (most reliable)
                setShowEmbed(true);
            }
        } else if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com')) {
            setPlatform('youtube');

            // Extract video ID using utility function
            const videoId = extractYouTubeVideoId(url);

            if (videoId) {
                // Use privacy-enhanced embed URL
                setEmbedUrl(getPrivacyEnhancedEmbedUrl(videoId));

                // Create fallback metadata if not provided
                if (!metadata) {
                    setFallbackMetadata({
                        url,
                        platform: 'youtube',
                        title: 'YouTube Video',
                        artist: 'YouTube',
                        cover_image: getYouTubeThumbnailUrl(videoId, 'hq'),
                        embed_url: getPrivacyEnhancedEmbedUrl(videoId),
                    });
                }
            }
        } else if (url.includes('music.apple.com')) {
            setPlatform('apple');
            // Apple Music embeds are unreliable, only set if metadata provides embed_url
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

    // Use provided metadata or fallback
    const displayMetadata = metadata || fallbackMetadata;

    // If we have metadata, show the MusicCard (always reliable)
    if (displayMetadata) {
        return (
            <div className={`w-full ${compact ? 'max-w-md' : 'max-w-lg'} my-2`}>
                {/* Show embed for Spotify (auto-shown) or YouTube (when toggled) */}
                {showEmbed && embedUrl && (
                    <div className="mb-2">
                        <iframe
                            style={{ borderRadius: '12px' }}
                            src={embedUrl}
                            width="100%"
                            height={getEmbedHeight()}
                            frameBorder="0"
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            loading="lazy"
                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                            className="bg-black/20"
                        />
                    </div>
                )}

                {/* Always show the card as a reliable fallback */}
                <MusicCard metadata={displayMetadata} compact={compact} />

                {/* Play inline button for YouTube only (Spotify auto-shows) */}
                {embedUrl && !showEmbed && platform === 'youtube' && (
                    <button
                        onClick={() => setShowEmbed(true)}
                        className="mt-2 flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors"
                    >
                        <Play className="w-3 h-3" />
                        Play inline
                    </button>
                )}

                {/* Collapse button when YouTube embed is shown */}
                {showEmbed && platform === 'youtube' && (
                    <button
                        onClick={() => setShowEmbed(false)}
                        className="mt-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                    >
                        Hide player
                    </button>
                )}
            </div>
        );
    }

    // NO METADATA - platform-specific handling

    // Spotify without metadata: Try embedding (usually works)
    if (platform === 'spotify' && embedUrl) {
        return (
            <div className={`w-full ${compact ? 'max-w-md' : 'max-w-full'} my-2`}>
                <iframe
                    style={{ borderRadius: '12px' }}
                    src={embedUrl}
                    width="100%"
                    height={getEmbedHeight()}
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    className="bg-black/20"
                />
            </div>
        );
    }

    // YouTube/Apple/Other without metadata: Show basic card (no external redirect)
    return (
        <div className={`flex items-center gap-3 p-3 ${config.bgColor} border ${config.borderColor} rounded-lg max-w-md`}>
            <div className={`w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                <MusicIcon className={`w-6 h-6 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-100 text-sm">{config.label}</div>
                <div className="text-xs text-gray-500 truncate">Music track</div>
            </div>
        </div>
    );
};

export default MusicEmbed;
