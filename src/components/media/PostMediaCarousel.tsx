import { useState } from "react";
import { ChevronLeft, ChevronRight, Play, Maximize2, Music } from "lucide-react";
import AsciiLightbox from "../ui/AsciiLightbox";
import MusicEmbed from "../MusicEmbed";
import { MusicMetadata } from "../MusicCard";

interface MediaItem {
    url: string;
    type: 'image' | 'video' | 'music';
}

interface MediaCarouselProps {
    media: MediaItem[];
    compact?: boolean; // For feed/home - shows smaller thumbnails
    musicMetadata?: MusicMetadata | null; // Cached music metadata for fallback
}

export default function PostMediaCarousel({ media: rawMedia, compact = false, musicMetadata }: MediaCarouselProps) {
    // Helper to robustly determine media type from URL if provided type is suspicious
    const getMediaType = (item: MediaItem): 'image' | 'video' | 'music' => {
        const url = item.url.toLowerCase();
        // If it's already music or video, trust it (unless we want to be super strict)
        // But if it's 'image' (or anything else) and has a music URL, override it.
        if (url.includes('spotify.com') || url.includes('soundcloud.com') || url.includes('youtu.be') || url.includes('youtube.com') || url.includes('music.apple.com')) {
            return 'music'; // MusicEmbed handles YouTube too
        }

        // Check for common video extensions if wrongly labeled as image
        if (url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.mov')) {
            return 'video';
        }

        return item.type;
    };

    const media = rawMedia?.map(item => ({
        ...item,
        type: getMediaType(item)
    })) || [];

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    if (!media || media.length === 0) return null;

    const openLightbox = (index: number) => {
        setCurrentIndex(index);
        setIsLightboxOpen(true);
    };

    const goToPrevious = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev === 0 ? media.length - 1 : prev - 1));
    };

    const goToNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev === media.length - 1 ? 0 : prev + 1));
    };

    const currentMedia = media[currentIndex];

    // Compact mode - Twitter-like small preview with click to expand
    if (compact) {
        return (
            <>
                <div
                    className="relative rounded-lg overflow-hidden cursor-pointer group border border-white/10 w-full bg-black"
                    onClick={() => openLightbox(0)}
                >
                    {/* Single Media */}
                    {media.length === 1 ? (
                        <div className="relative w-full flex justify-center bg-black">
                            {media[0].type === 'image' ? (
                                <img
                                    src={media[0].url}
                                    alt="Post media"
                                    loading="lazy"
                                    className="w-full h-auto max-h-[320px] md:max-h-[500px] object-cover transition-transform duration-300 group-hover:scale-105"
                                    style={{ width: '100%', objectPosition: 'center' }}
                                />
                            ) : media[0].type === 'video' ? (
                                <div className="relative w-full aspect-video md:aspect-[4/5] max-h-[320px] bg-black overflow-hidden">
                                    <video
                                        src={media[0].url}
                                        className="w-full h-full object-cover opacity-90"
                                        preload="metadata"
                                        muted
                                        playsInline
                                        autoPlay
                                        loop
                                        controls={false}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/50 p-3 rounded-full border border-white/20 backdrop-blur-sm">
                                            <Play className="w-8 h-8 text-white fill-white" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Music (Full width in single view)
                                <div className="w-full p-2 bg-black border border-green-900 rounded" onClick={(e) => e.stopPropagation()}>
                                    <MusicEmbed url={media[0].url} metadata={musicMetadata} />
                                </div>
                            )}
                        </div>
                    ) : media.length === 2 ? (
                        // Two items - constrained height
                        <div className="grid grid-cols-2 gap-0.5 h-48 md:h-64 w-full">
                            {media.slice(0, 2).map((item, index) => (
                                <div key={index} className="relative w-full h-full" onClick={(e) => { e.stopPropagation(); openLightbox(index); }}>
                                    {item.type === 'image' ? (
                                        <img src={item.url} alt={`Media ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                    ) : item.type === 'video' ? (
                                        <div className="relative w-full h-full bg-black overflow-hidden">
                                            <video src={item.url} className="w-full h-full object-cover opacity-90" preload="metadata" muted autoPlay loop playsInline />
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <Play className="w-6 h-6 text-white fill-white opacity-80" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center w-full h-full bg-black border border-green-900 overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                                {/* Render compact player if possible, or icon */}
                                                <MusicEmbed url={item.url} compact metadata={musicMetadata} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : media.length === 3 ? (
                        // Three items - constrained height
                        <div className="grid grid-cols-2 gap-0.5 h-48 md:h-64 w-full">
                            <div className="row-span-2 relative w-full h-full" onClick={(e) => { e.stopPropagation(); openLightbox(0); }}>
                                {media[0].type === 'image' ? (
                                    <img src={media[0].url} alt="Media 1" className="w-full h-full object-cover" loading="lazy" />
                                ) : media[0].type === 'video' ? (
                                    <div className="relative w-full h-full bg-black">
                                        <video src={media[0].url} className="w-full h-full object-cover" preload="metadata" muted />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Play className="w-8 h-8 text-white fill-white" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center w-full h-full bg-black border border-green-900 overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                            <MusicEmbed url={media[0].url} compact metadata={musicMetadata} />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-rows-2 gap-0.5 w-full h-full">
                                {media.slice(1, 3).map((item, index) => (
                                    <div key={index} className="relative w-full h-full" onClick={(e) => { e.stopPropagation(); openLightbox(index + 1); }}>
                                        {item.type === 'image' ? (
                                            <img src={item.url} alt={`Media ${index + 2}`} className="w-full h-full object-cover" loading="lazy" />
                                        ) : item.type === 'video' ? (
                                            <div className="relative w-full h-full bg-black">
                                                <video src={item.url} className="w-full h-full object-cover" preload="metadata" muted />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Play className="w-6 h-6 text-white fill-white" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center w-full h-full bg-black border border-green-900">
                                                <div className="flex flex-col items-center justify-center">
                                                    <Music className="w-6 h-6 text-green-400 mb-1" />
                                                    <span className="text-[10px] text-green-400/80">Music</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // Four+ items - constrained height
                        <div className="grid grid-cols-2 gap-0.5 h-48 md:h-64 w-full">
                            {media.slice(0, 4).map((item, index) => (
                                <div key={index} className="relative w-full h-full" onClick={(e) => { e.stopPropagation(); openLightbox(index); }}>
                                    {item.type === 'image' ? (
                                        <img src={item.url} alt={`Media ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                    ) : item.type === 'video' ? (
                                        <div className="relative w-full h-full bg-black">
                                            <video src={item.url} className="w-full h-full object-cover" preload="metadata" muted />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Play className="w-6 h-6 text-white fill-white" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center w-full h-full bg-black border border-green-900">
                                            <div className="flex flex-col items-center justify-center">
                                                <Music className="w-6 h-6 text-green-400 mb-1" />
                                                <span className="text-[10px] text-green-400/80">Music</span>
                                            </div>
                                        </div>
                                    )}
                                    {/* Overflow Count */}
                                    {index === 3 && media.length > 4 && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-colors hover:bg-black/70">
                                            <span className="text-white text-xl font-bold font-mono">+{media.length - 4}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Expand Overlay Hint */}
                    <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Maximize2 className="w-4 h-4 text-white" />
                    </div>
                </div>

                <AsciiLightbox
                    media={media}
                    initialIndex={currentIndex}
                    isOpen={isLightboxOpen}
                    onClose={() => setIsLightboxOpen(false)}
                />
            </>
        );
    }

    // Full Mode (Post Detail) - Can reuse Lightbox for internal clicks too if desired, 
    // but typically Full Mode is already large. 
    // However, clicking an image in Full Mode should probably also open Lightbox for "Zoom".
    return (
        <>
            <div className="relative mb-6 ascii-box overflow-hidden bg-black max-h-[80vh]">
                <div
                    className="relative w-full h-full flex items-center justify-center cursor-zoom-in bg-zinc-950"
                    onClick={() => setIsLightboxOpen(true)}
                >
                    {currentMedia.type === 'image' ? (
                        <img
                            src={currentMedia.url}
                            alt={`Media ${currentIndex + 1}`}
                            className="max-w-full max-h-[600px] object-contain"
                        />
                    ) : currentMedia.type === 'video' ? (
                        <video
                            src={currentMedia.url}
                            className="max-w-full max-h-[500px] object-contain"
                            controls
                            muted
                            playsInline
                            // For full post, we might allow controls, but lightbox is better for focus.
                            onClick={(e) => { e.stopPropagation(); }}
                        />
                    ) : (
                        <div className="w-full max-w-2xl px-4" onClick={(e) => e.stopPropagation()}>
                            <MusicEmbed url={currentMedia.url} metadata={musicMetadata} />
                        </div>
                    )}
                </div>

                {media.length > 1 && (
                    <>
                        <button
                            onClick={goToPrevious}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-2 rounded-full border border-green-600 transition-colors"
                        >
                            <ChevronLeft className="w-6 h-6 text-green-400" />
                        </button>
                        <button
                            onClick={goToNext}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-2 rounded-full border border-green-600 transition-colors"
                        >
                            <ChevronRight className="w-6 h-6 text-green-400" />
                        </button>

                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 bg-black/50 px-3 py-1.5 rounded-full">
                            {media.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentIndex(index);
                                    }}
                                    className={`w-2 h-2 rounded-full transition-colors ${index === currentIndex
                                        ? 'bg-green-400'
                                        : 'bg-white/30 hover:bg-white/50'
                                        }`}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            <AsciiLightbox
                media={media}
                initialIndex={currentIndex}
                isOpen={isLightboxOpen}
                onClose={() => setIsLightboxOpen(false)}
            />
        </>
    );
}
