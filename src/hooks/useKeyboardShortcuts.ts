import { useEffect } from "react";

interface KeyboardShortcuts {
    onHelp?: () => void;
    onSearch?: () => void;
}

export function useKeyboardShortcuts({ onHelp, onSearch }: KeyboardShortcuts = {}) {
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input/textarea
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
                return;
            }

            switch (e.key.toLowerCase()) {
                case "j":
                    // Scroll down
                    window.scrollBy({ top: 100, behavior: "smooth" });
                    break;
                case "k":
                    // Scroll up
                    window.scrollBy({ top: -100, behavior: "smooth" });
                    break;
                case "g":
                    if (e.shiftKey) {
                        // Shift+G: Jump to bottom
                        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                    } else {
                        // g: Jump to top
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                    break;
                case "/":
                    // Focus search
                    e.preventDefault();
                    if (onSearch) onSearch();
                    break;
                case "?":
                    // Show help
                    e.preventDefault();
                    if (onHelp) onHelp();
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyPress);
        return () => window.removeEventListener("keydown", handleKeyPress);
    }, [onHelp, onSearch]);
}
