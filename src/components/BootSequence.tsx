import { useEffect, useState } from "react";

const BootSequence = ({ onComplete }: { onComplete: () => void }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Show loader for 6 seconds then fade out
        const timer = setTimeout(() => {
            setIsVisible(false);
            // Allow fade out animation to finish before unmounting
            setTimeout(onComplete, 500);
        }, 6000);

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div
            className={`fixed inset-0 bg-background z-[100] flex items-center justify-center transition-opacity duration-500 ${isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
        >
            <img
                src="/loader.gif"
                alt="Loading..."
                className="max-h-screen max-w-full object-contain mix-blend-screen brightness-75 contrast-150"
            />
        </div>
    );
};

export default BootSequence;
