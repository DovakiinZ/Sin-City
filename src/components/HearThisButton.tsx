import { useState } from "react";
import { Music, Play, Pause, SkipForward, SkipBack, Square, Users } from "lucide-react";
import { useMusicLinks } from "@/hooks/useMusicLinks";
import LiveListenersModal from "./effects/LiveListenersModal";

const HearThisButton = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
    const { musicLinks: allMusicLinks, loading } = useMusicLinks();

    // Filter out hidden songs for the public feed
    const musicLinks = allMusicLinks.filter(link => !link.is_hidden);

    const openSong = (index: number) => {
        if (musicLinks.length === 0) return;
        const song = musicLinks[index];
        window.open(song.url, "_blank", "noopener,noreferrer");
    };

    const handlePlay = () => {
        if (musicLinks.length === 0) {
            alert("No songs available yet! Admin can add songs in the Admin Dashboard.");
            return;
        }

        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 600);

        if (!isPlaying) {
            openSong(currentIndex);
            setIsPlaying(true);
        } else {
            // Resume - reopen current song
            openSong(currentIndex);
        }
    };

    const handlePause = () => {
        setIsPlaying(false);
    };

    const handleNext = () => {
        if (musicLinks.length === 0) return;
        const nextIndex = (currentIndex + 1) % musicLinks.length;
        setCurrentIndex(nextIndex);
        if (isPlaying) {
            openSong(nextIndex);
        }
    };

    const handlePrevious = () => {
        if (musicLinks.length === 0) return;
        const prevIndex = currentIndex === 0 ? musicLinks.length - 1 : currentIndex - 1;
        setCurrentIndex(prevIndex);
        if (isPlaying) {
            openSong(prevIndex);
        }
    };

    const handleStop = () => {
        setIsPlaying(false);
        setCurrentIndex(0);
    };

    // Show loading state
    if (loading) {
        return (
            <div className="w-full ascii-box p-4 opacity-50">
                <div className="flex items-center justify-center">
                    <Music className="w-5 h-5 ascii-highlight animate-pulse" />
                    <pre className="ascii-dim text-xs ml-2">Loading...</pre>
                </div>
            </div>
        );
    }

    const currentSong = musicLinks[currentIndex];

    return (
        <div className="w-full ascii-box p-4 space-y-3 relative">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Music
                        className={`
                            w-5 h-5 ascii-highlight 
                            transition-transform duration-300
                            ${isAnimating ? "rotate-12" : ""}
                            ${isPlaying ? "animate-pulse" : ""}
                        `}
                    />
                    <div className="text-left">
                        <pre className="ascii-highlight text-sm font-bold">HEAR THIS</pre>
                        <div className="flex items-center gap-2 mt-0.5">
                            <pre className="ascii-dim text-xs">
                                {musicLinks.length > 0
                                    ? `${currentIndex + 1}/${musicLinks.length} songs`
                                    : "No songs yet"}
                            </pre>
                            <button 
                                onClick={() => setIsLiveModalOpen(true)}
                                className="flex items-center gap-1 text-[10px] text-green-500/80 hover:text-green-400 border border-green-900/50 hover:border-green-500/50 rounded px-1.5 py-0.5 transition-colors bg-green-950/20"
                                title="See who is listening to Spotify live"
                            >
                                <Users className="w-3 h-3" />
                                Live
                            </button>
                        </div>
                    </div>
                </div>
                <div className="ascii-dim text-xs hidden sm:block">
                    🎵
                </div>
            </div>


            {/* Current Song Display */}
            {musicLinks.length > 0 && currentSong && (
                <div className="border-t border-ascii-border pt-2">
                    <div className="flex items-center gap-2 mb-1">
                        <span
                            className={`text-xs px-2 py-0.5 rounded ${currentSong.platform === "Spotify"
                                ? "bg-green-600/20 text-green-400"
                                : "bg-red-600/20 text-red-400"
                                }`}
                        >
                            {currentSong.platform}
                        </span>
                    </div>
                    <pre className="ascii-text text-xs truncate">
                        {currentSong.title}
                    </pre>
                </div>
            )}

            {/* Playback Controls */}
            {musicLinks.length > 0 && (
                <div className="flex items-center justify-center gap-2 border-t border-ascii-border pt-3">
                    <button
                        onClick={handlePrevious}
                        className="ascii-nav-link hover:ascii-highlight p-2 border border-ascii-border transition-colors"
                        title="Previous"
                        aria-label="Previous song"
                    >
                        <SkipBack className="w-4 h-4" />
                    </button>

                    {!isPlaying ? (
                        <button
                            onClick={handlePlay}
                            className="ascii-nav-link hover:ascii-highlight p-2 border border-ascii-border transition-colors bg-ascii-highlight/10"
                            title="Play"
                            aria-label="Play"
                        >
                            <Play className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handlePause}
                            className="ascii-nav-link hover:ascii-highlight p-2 border border-ascii-border transition-colors bg-ascii-highlight/10"
                            title="Pause"
                            aria-label="Pause"
                        >
                            <Pause className="w-4 h-4" />
                        </button>
                    )}

                    <button
                        onClick={handleNext}
                        className="ascii-nav-link hover:ascii-highlight p-2 border border-ascii-border transition-colors"
                        title="Next"
                        aria-label="Next song"
                    >
                        <SkipForward className="w-4 h-4" />
                    </button>

                    <button
                        onClick={handleStop}
                        className="ascii-nav-link hover:text-red-400 p-2 border border-ascii-border transition-colors"
                        title="Stop"
                        aria-label="Stop"
                    >
                        <Square className="w-4 h-4" />
                    </button>
                </div>
            )}
            
            <LiveListenersModal isOpen={isLiveModalOpen} onClose={() => setIsLiveModalOpen(false)} />
        </div>
    );
};

export default HearThisButton;
