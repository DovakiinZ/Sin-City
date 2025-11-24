import { useState } from "react";
import { Music } from "lucide-react";
import { useMusicLinks } from "@/hooks/useMusicLinks";

const HearThisButton = () => {
    const [isAnimating, setIsAnimating] = useState(false);
    const { musicLinks, loading } = useMusicLinks();

    const handleClick = () => {
        // If no songs in database, show a message
        if (musicLinks.length === 0) {
            alert("No songs available yet! Admin can add songs in the Admin Dashboard.");
            return;
        }

        // Shuffle and pick a random music link
        const randomIndex = Math.floor(Math.random() * musicLinks.length);
        const selectedMusic = musicLinks[randomIndex];

        // Trigger animation
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 600);

        // Open in new tab after a short delay for effect
        setTimeout(() => {
            window.open(selectedMusic.url, "_blank", "noopener,noreferrer");
        }, 300);
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

    return (
        <button
            onClick={handleClick}
            className={`
        w-full ascii-box p-4 
        hover:bg-ascii-highlight/10 
        transition-all duration-300
        group
        ${isAnimating ? "animate-pulse scale-95" : ""}
      `}
            aria-label="Listen to curated music"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Music
                        className={`
              w-5 h-5 ascii-highlight 
              transition-transform duration-300
              ${isAnimating ? "rotate-12" : "group-hover:rotate-6"}
            `}
                    />
                    <div className="text-left">
                        <pre className="ascii-highlight text-sm font-bold">HEAR THIS</pre>
                        <pre className="ascii-dim text-xs">
                            {musicLinks.length > 0
                                ? `${musicLinks.length} songs →`
                                : "No songs yet"}
                        </pre>
                    </div>
                </div>
                <div className="ascii-dim text-xs hidden sm:block">
                    🎵
                </div>
            </div>
        </button>
    );
};

export default HearThisButton;
