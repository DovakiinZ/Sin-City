import { useEffect, useState } from "react";

const BootSequence = ({ onComplete }: { onComplete: () => void }) => {
    const [progress, setProgress] = useState(0);
    const [currentLine, setCurrentLine] = useState(0);

    const bootLines = [
        "SIN CITY BIOS v1.0.0",
        "Copyright (C) 2025 Dovakiin Systems",
        "",
        "Initializing system...",
        "Memory Test: 640K OK",
        "CPU: Intel 8086 Compatible",
        "Loading kernel...",
        "",
    ];

    useEffect(() => {
        // Show boot lines one by one
        const lineInterval = setInterval(() => {
            setCurrentLine((prev) => {
                if (prev < bootLines.length - 1) {
                    return prev + 1;
                }
                clearInterval(lineInterval);
                return prev;
            });
        }, 200);

        // Progress bar animation
        const progressInterval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(progressInterval);
                    setTimeout(onComplete, 500);
                    return 100;
                }
                return prev + 2;
            });
        }, 50);

        return () => {
            clearInterval(lineInterval);
            clearInterval(progressInterval);
        };
    }, [onComplete]);

    const progressBar = "█".repeat(Math.floor(progress / 5)) + "░".repeat(20 - Math.floor(progress / 5));

    return (
        <div className="fixed inset-0 bg-background z-[100] flex items-center justify-center">
            <div className="ascii-text text-xs sm:text-sm">
                <pre className="ascii-highlight mb-4">
                    {bootLines.slice(0, currentLine + 1).join("\n")}
                </pre>

                {currentLine >= bootLines.length - 1 && (
                    <pre className="ascii-text">
                        {`[${progressBar}] ${progress}%`}
                    </pre>
                )}
            </div>
        </div>
    );
};

export default BootSequence;
