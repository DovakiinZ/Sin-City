import { useState, useEffect } from "react";

interface TypingTextProps {
    text: string;
    speed?: number; // ms per character
    className?: string;
    showCursor?: boolean;
    onComplete?: () => void;
    startDelay?: number; // delay before starting to type
}

const TypingText = ({
    text,
    speed = 50,
    className = "",
    showCursor = true,
    onComplete,
    startDelay = 0
}: TypingTextProps) => {
    const [displayedText, setDisplayedText] = useState("");
    const [isComplete, setIsComplete] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);

    useEffect(() => {
        // Reset when text changes
        setDisplayedText("");
        setIsComplete(false);
        setHasStarted(false);

        // Start delay
        const startTimer = setTimeout(() => {
            setHasStarted(true);
        }, startDelay);

        return () => clearTimeout(startTimer);
    }, [text, startDelay]);

    useEffect(() => {
        if (!hasStarted) return;

        if (displayedText.length < text.length) {
            const timer = setTimeout(() => {
                setDisplayedText(text.slice(0, displayedText.length + 1));
            }, speed);
            return () => clearTimeout(timer);
        } else {
            setIsComplete(true);
            onComplete?.();
        }
    }, [displayedText, text, speed, hasStarted, onComplete]);

    return (
        <span className={className}>
            {displayedText}
            {showCursor && !isComplete && (
                <span className="animate-pulse">_</span>
            )}
            {showCursor && isComplete && (
                <span className="animate-[blink_1s_step-end_infinite]">_</span>
            )}
        </span>
    );
};

export default TypingText;
