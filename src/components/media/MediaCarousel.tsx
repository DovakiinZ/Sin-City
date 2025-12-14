import { useState } from "react";
import { ChevronLeft, ChevronRight, X, Play } from "lucide-react";

interface MediaItem {
    url: string;
    type: 'image' | 'video';
}

interface MediaCarouselProps {
    media: MediaItem[];
}

export default function MediaCarousel({ media }: MediaCarouselProps) {
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
