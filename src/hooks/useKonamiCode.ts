import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function useKonamiCode() {
    const [triggered, setTriggered] = useState(false);
    const { toast } = useToast();
    const konamiCode = [
        "ArrowUp",
        "ArrowUp",
        "ArrowDown",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowLeft",
        "ArrowRight",
        "b",
        "a",
    ];
    const [keyIndex, setKeyIndex] = useState(0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === konamiCode[keyIndex]) {
                const nextIndex = keyIndex + 1;
                if (nextIndex === konamiCode.length) {
                    setTriggered((prev) => !prev);
                    setKeyIndex(0);
                    toast({
                        title: "CHEAT CODE ACTIVATED",
                        description: "Welcome to the Matrix...",
                        className: "border-green-500 text-green-500 bg-black",
                    });
                } else {
                    setKeyIndex(nextIndex);
                }
            } else {
                setKeyIndex(0);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [keyIndex, toast]);

    return triggered;
}
