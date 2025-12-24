import { Music, ExternalLink } from "lucide-react";

export interface MusicMetadata {
    url: string;
    platform: 'spotify' | 'youtube' | 'apple';
    title: string;
    artist: string;
    cover_image: string;
    embed_url?: string;
    preview_url?: string;
    cached_at?: string;
}

interface MusicCardProps {
    metadata: MusicMetadata;
    compact?: boolean;
}

/**
 * Fallback card for music that always renders regardless of embed status.
 * Shows cover image, title, artist, and platform badge.
 */
export default function MusicCard({ metadata, compact = false }: MusicCardProps) {
    const { title, artist, cover_image, platform, url } = metadata;

    const platformConfig = {
        spotify: {
            color: 'text-green-500',
            bgColor: 'bg-green-500/10',
            borderColor: 'border-green-500/30',
            label: 'Spotify',
        },
        youtube: {
            color: 'text-red-500',
            bgColor: 'bg-red-500/10',
            borderColor: 'border-red-500/30',
            label: 'YouTube Music',
        },
        apple: {
            color: 'text-pink-500',
            bgColor: 'bg-pink-500/10',
            borderColor: 'border-pink-500/30',
            label: 'Apple Music',
        },
    };

    const config = platformConfig[platform] || platformConfig.spotify;

    if (compact) {
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 p-2 bg-black/80 border ${config.borderColor} rounded-lg hover:bg-black/60 transition-colors group`}
            >
                {/* Mini Cover */}
                <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-900">
                    {cover_image ? (
                        <img src={cover_image} alt={title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Music className={`w-4 h-4 ${config.color} opacity-50`} />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-100 text-xs truncate">{title}</div>
                    <div className={`text-[10px] ${config.color} uppercase tracking-wide`}>
                        {config.label}
                    </div>
                </div>

                {/* External Link Icon */}
                <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-green-400 transition-colors" />
            </a>
        );
    }

    return (
        <div className={`flex items-center gap-3 p-3 bg-black/80 border ${config.borderColor} rounded-lg max-w-md`}>
            {/* Cover Image */}
            <div className="w-14 h-14 flex-shrink-0 rounded overflow-hidden bg-gray-900">
                {cover_image ? (
                    <img src={cover_image} alt={title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Music className={`w-6 h-6 ${config.color} opacity-50`} />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-100 text-sm truncate">{title}</div>
                <div className="text-xs text-gray-500 truncate">{artist}</div>
                <div className={`text-[10px] ${config.color} uppercase tracking-wide mt-0.5`}>
                    {config.label}
                </div>
            </div>

            {/* External Link */}
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-green-400 p-2 transition-colors"
                title={`Open in ${config.label}`}
            >
                <ExternalLink className="w-4 h-4" />
            </a>
        </div>
    );
}
