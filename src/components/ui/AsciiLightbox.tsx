import { useState, useEffect, useCallback } from "react";
import MusicEmbed from "../MusicEmbed";

interface LightboxMedia {
    url: string;
    type: 'image' | 'video' | 'music';
}

interface AsciiLightboxProps {
    media: LightboxMedia[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
}

const AsciiLightbox = ({ media, initialIndex = 0, isOpen, onClose }: AsciiLightboxProps) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    // Reset to initial index when opening
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
        }
    }, [isOpen, initialIndex]);

    const goNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % media.length);
    }, [media.length]);

    const goPrev = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + media.length) % media.length);
    }, [media.length]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case 'ArrowRight':
                    goNext();
                    break;
                case 'ArrowLeft':
                    goPrev();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, goNext, goPrev]);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen || media.length === 0) return null;

    const currentMedia = media[currentIndex];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop with scanlines effect */}
            <div
                className="absolute inset-0 bg-black/95 backdrop-blur-sm"
                onClick={onClose}
            >
                {/* Scanline overlay */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-10"
                    style={{
                        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.03) 2px, rgba(0, 255, 0, 0.03) 4px)'
                    }}
                />
            </div>

            {/* ASCII Frame */}
            <div className="relative z-10 max-w-[95vw] max-h-[95vh] p-2">
                {/* Top border */}
                <pre className="ascii-highlight text-xs text-center">
                    {`╔${'═'.repeat(Math.min(60, 40))}╗`}
                </pre>

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-0 right-4 ascii-text hover:ascii-highlight text-xl z-20"
                    title="Close (Esc)"
                >
                    [X]
                </button>

                {/* Content area with side borders */}
                <div className="relative flex items-center">
                    {/* Left border */}
                    <pre className="ascii-highlight text-xs self-stretch flex items-center">║</pre>

                    {/* Media content */}
                    <div className="flex items-center justify-center p-4 min-w-[300px] min-h-[200px] max-w-[90vw] max-h-[80vh]">
                        {currentMedia.type === 'video' ? (
                            <video
                                src={currentMedia.url}
                                controls
                                autoPlay
                                className="max-w-full max-h-[75vh] object-contain"
                            />
                        ) : currentMedia.type === 'music' ? (
                            <div className="w-[80vw] max-w-lg bg-black border border-green-800 p-4 rounded">
                                <MusicEmbed url={currentMedia.url} />
                            </div>
                        ) : (
                            <img
                                src={currentMedia.url}
                                alt={`Image ${currentIndex + 1}`}
                                className="max-w-full max-h-[75vh] object-contain"
                            />
                        )}
                    </div>

                    {/* Right border */}
                    <pre className="ascii-highlight text-xs self-stretch flex items-center">║</pre>
                </div>

                {/* Bottom border with counter */}
                <div className="flex items-center justify-center">
                    <pre className="ascii-highlight text-xs">
                        {`╚${'═'.repeat(10)}[ ${currentIndex + 1} / ${media.length} ]${'═'.repeat(10)}╝`}
                    </pre>
                </div>

                {/* Navigation arrows */}
                {media.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); goPrev(); }}
                            className="absolute left-0 top-1/2 -translate-y-1/2 ascii-box bg-black/80 px-3 py-4 hover:bg-green-600/30 transition-colors"
                            title="Previous (←)"
                        >
                            <pre className="ascii-text text-lg">[◀]</pre>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); goNext(); }}
                            className="absolute right-0 top-1/2 -translate-y-1/2 ascii-box bg-black/80 px-3 py-4 hover:bg-green-600/30 transition-colors"
                            title="Next (→)"
                        >
                            <pre className="ascii-text text-lg">[▶]</pre>
                        </button>
                    </>
                )}
            </div>

            {/* Help text */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                <pre className="ascii-dim text-xs">
                    Esc to close | ← → to navigate
                </pre>
            </div>
        </div>
    );
};

export default AsciiLightbox;
