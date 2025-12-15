import { useState } from "react";
import { ChevronLeft, ChevronRight, X, Play, Maximize2 } from "lucide-react";

interface MediaItem {
    url: string;
    type: 'image' | 'video';
}

interface MediaCarouselProps {
    media: MediaItem[];
    compact?: boolean; // For feed/home - shows smaller thumbnails
}

export default function PostMediaCarousel({ media, compact = false }: MediaCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    if (!media || media.length === 0) return null;

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
                {/* Compact Grid Preview */}
                <div
                    className="relative rounded-lg overflow-hidden cursor-pointer group"
                    style={{ maxHeight: "256px" }}
                    onClick={() => setIsFullscreen(true)}
                >
                    {/* Single image or first image of gallery */}
                    {media.length === 1 ? (
                        // Single media - Fixed height for compactness
                        <div className="relative h-64 w-full overflow-hidden rounded-xl border border-white/10">
                            {currentMedia.type === 'image' ? (
                                <img
                                    src={currentMedia.url}
                                    alt="Post media"
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                            ) : (
                                <div className="relative w-full h-full">
                                    <video
                                        src={currentMedia.url}
                                        className="w-full h-full object-cover"
                                        muted
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                        <Play className="w-12 h-12 text-white" fill="white" />
                                    </div>
                                </div>
                            )}
                            {/* Expand icon */}
                            <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-4 h-4 text-white" />
                            </div>
                        </div>
                        // Two images - side by side
                    ) : media.length === 2 ? (
                        <div className="grid grid-cols-2 gap-0.5 h-64 w-full overflow-hidden rounded-xl border border-white/10">
                            {media.slice(0, 2).map((item, index) => (
                                <div key={index} className="relative w-full h-full">
                                    {item.type === 'image' ? (
                                        <img
                                            src={item.url}
                                            alt={`Media ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="relative w-full h-full">
                                            <video src={item.url} className="w-full h-full object-cover" muted />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                <Play className="w-8 h-8 text-white" fill="white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-4 h-4 text-white" />
                            </div>
                        </div>
                    ) : media.length === 3 ? (
                        // Three images - one large, two small
                        <div className="grid grid-cols-2 gap-0.5 h-64 w-full overflow-hidden rounded-xl border border-white/10">
                            <div className="row-span-2 relative w-full h-full">
                                {media[0].type === 'image' ? (
                                    <img src={media[0].url} alt="Media 1" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="relative w-full h-full">
                                        <video src={media[0].url} className="w-full h-full object-cover" muted />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                            <Play className="w-8 h-8 text-white" fill="white" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-rows-2 gap-0.5 w-full h-full">
                                {media.slice(1, 3).map((item, index) => (
                                    <div key={index} className="relative w-full h-full">
                                        {item.type === 'image' ? (
                                            <img src={item.url} alt={`Media ${index + 2}`} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="relative w-full h-full">
                                                <video src={item.url} className="w-full h-full object-cover" muted />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                    <Play className="w-6 h-6 text-white" fill="white" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-4 h-4 text-white" />
                            </div>
                        </div>
                    ) : (
                        // Four or more - 2x2 grid with "+N more" overlay
                        <div className="grid grid-cols-2 gap-0.5 h-64 w-full overflow-hidden rounded-xl border border-white/10">
                            {media.slice(0, 4).map((item, index) => (
                                <div key={index} className="relative w-full h-full">
                                    {item.type === 'image' ? (
                                        <img src={item.url} alt={`Media ${index + 1}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="relative w-full h-full">
                                            <video src={item.url} className="w-full h-full object-cover" muted />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                <Play className="w-6 h-6 text-white" fill="white" />
                                            </div>
                                        </div>
                                    )}
                                    {/* Show "+N more" on last visible item if there are more */}
                                    {index === 3 && media.length > 4 && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <span className="text-white text-xl font-bold">+{media.length - 4}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-4 h-4 text-white" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Fullscreen Modal - same as before */}
                {isFullscreen && (
                    <div
                        className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                        onClick={() => setIsFullscreen(false)}
                    >
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="absolute top-4 right-4 bg-black/50 hover:bg-black p-2 rounded-full border border-green-600 z-10"
                        >
                            <X className="w-6 h-6 text-green-400" />
                        </button>

                        <div className="max-w-[90vw] max-h-[90vh] relative">
                            {currentMedia.type === 'image' ? (
                                <img
                                    src={currentMedia.url}
                                    alt={`Media ${currentIndex + 1}`}
                                    className="max-w-full max-h-[90vh] object-contain"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <video
                                    src={currentMedia.url}
                                    className="max-w-full max-h-[90vh] object-contain"
                                    controls
                                    autoPlay
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                        </div>

                        {media.length > 1 && (
                            <>
                                <button
                                    onClick={goToPrevious}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-3 rounded-full border border-green-600"
                                >
                                    <ChevronLeft className="w-8 h-8 text-green-400" />
                                </button>
                                <button
                                    onClick={goToNext}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-3 rounded-full border border-green-600"
                                >
                                    <ChevronRight className="w-8 h-8 text-green-400" />
                                </button>
                            </>
                        )}

                        {media.length > 1 && (
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 rounded-full border border-green-600">
                                <span className="text-green-400 text-lg font-mono">
                                    {currentIndex + 1} / {media.length}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </>
        );
    }

    // Full mode - for post detail pages (original behavior)
    return (
        <>
            {/* Main Carousel */}
            <div className="relative mb-6 ascii-box overflow-hidden bg-black">
                {/* Media Display */}
                <div
                    className="relative aspect-video flex items-center justify-center cursor-pointer"
                    onClick={() => setIsFullscreen(true)}
                >
                    {currentMedia.type === 'image' ? (
                        <img
                            src={currentMedia.url}
                            alt={`Media ${currentIndex + 1}`}
                            className="max-w-full max-h-full object-contain"
                        />
                    ) : (
                        <video
                            src={currentMedia.url}
                            className="max-w-full max-h-full object-contain"
                            controls
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>

                {/* Navigation Arrows - only show if more than 1 item */}
                {media.length > 1 && (
                    <>
                        <button
                            onClick={goToPrevious}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-2 rounded-full border border-green-600 transition-colors"
                            aria-label="Previous"
                        >
                            <ChevronLeft className="w-6 h-6 text-green-400" />
                        </button>
                        <button
                            onClick={goToNext}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-2 rounded-full border border-green-600 transition-colors"
                            aria-label="Next"
                        >
                            <ChevronRight className="w-6 h-6 text-green-400" />
                        </button>
                    </>
                )}

                {/* Counter/Dots */}
                {media.length > 1 && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 px-3 py-1 rounded-full">
                        <span className="text-green-400 text-sm font-mono">
                            {currentIndex + 1} / {media.length}
                        </span>
                    </div>
                )}

                {/* Thumbnail Dots */}
                {media.length > 1 && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1">
                        {media.map((_, index) => (
                            <button
                                key={index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentIndex(index);
                                }}
                                className={`w-2 h-2 rounded-full transition-colors ${index === currentIndex
                                    ? 'bg-green-400'
                                    : 'bg-green-900 hover:bg-green-600'
                                    }`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Fullscreen Modal */}
            {isFullscreen && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                    onClick={() => setIsFullscreen(false)}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => setIsFullscreen(false)}
                        className="absolute top-4 right-4 bg-black/50 hover:bg-black p-2 rounded-full border border-green-600"
                    >
                        <X className="w-6 h-6 text-green-400" />
                    </button>

                    {/* Fullscreen Media */}
                    <div className="max-w-[90vw] max-h-[90vh] relative">
                        {currentMedia.type === 'image' ? (
                            <img
                                src={currentMedia.url}
                                alt={`Media ${currentIndex + 1}`}
                                className="max-w-full max-h-[90vh] object-contain"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <video
                                src={currentMedia.url}
                                className="max-w-full max-h-[90vh] object-contain"
                                controls
                                autoPlay
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                    </div>

                    {/* Fullscreen Navigation */}
                    {media.length > 1 && (
                        <>
                            <button
                                onClick={goToPrevious}
                                className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-3 rounded-full border border-green-600"
                            >
                                <ChevronLeft className="w-8 h-8 text-green-400" />
                            </button>
                            <button
                                onClick={goToNext}
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black p-3 rounded-full border border-green-600"
                            >
                                <ChevronRight className="w-8 h-8 text-green-400" />
                            </button>
                        </>
                    )}

                    {/* Counter */}
                    {media.length > 1 && (
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 rounded-full border border-green-600">
                            <span className="text-green-400 text-lg font-mono">
                                {currentIndex + 1} / {media.length}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
