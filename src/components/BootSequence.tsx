import { useEffect, useRef, useState } from "react";
import cicadaAscii from "./cicada.txt?raw";

const BootSequence = ({ onComplete }: { onComplete: () => void }) => {
    const [isVisible, setIsVisible] = useState(true);
    const [value, setValue] = useState("");
    const [resp, setResp] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const enteredRef = useRef(false);

    const enter = () => {
        if (enteredRef.current) return;
        enteredRef.current = true;
        setIsVisible(false);
        // Allow fade-out animation to finish before unmounting
        setTimeout(onComplete, 500);
    };

    const attempt = (raw: string) => {
        const v = raw.trim().toLowerCase();
        if (v === "" || v === "enter" || v === "begin") {
            enter();
        } else {
            setResp("> the cicada is silent. press enter to descend.");
        }
    };

    useEffect(() => {
        inputRef.current?.focus();
        // Global Enter — works even if the prompt is not focused
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Enter" && document.activeElement !== inputRef.current) {
                e.preventDefault();
                enter();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center px-5 py-10 transition-opacity duration-500 ${
                isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            style={{
                backgroundColor: "hsl(var(--background))",
                backgroundImage:
                    "radial-gradient(55% 50% at 50% 48%, hsl(var(--ascii-highlight) / 0.10), transparent 70%)",
            }}
            onClick={() => inputRef.current?.focus()}
        >
            <style>{`
                @keyframes bootPulse {
                    0%,100% { opacity:.9; filter: drop-shadow(0 0 14px hsl(var(--ascii-highlight) / .5)); }
                    50%     { opacity:1;  filter: drop-shadow(0 0 32px hsl(var(--ascii-highlight) / .5)); }
                }
                @keyframes bootBlink { 50% { opacity:0; } }
                @keyframes bootFade  { to { opacity:1; } }
                @keyframes bootAllFade { from { opacity:0; } to { opacity:1; } }
                .boot-scan::after {
                    content:""; position:absolute; inset:0; pointer-events:none; z-index:2;
                    background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.35) 3px, transparent 4px);
                    mix-blend-mode: multiply;
                }
            `}</style>

            <div
                className="boot-scan"
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            />

            <div
                className="text-center w-full"
                style={{
                    maxWidth: 560,
                    position: "relative",
                    zIndex: 3,
                    opacity: 0,
                    animation: "bootAllFade 1.6s ease forwards",
                }}
            >
                <div
                    style={{
                        fontSize: "clamp(9px, 2.6vw, 12px)",
                        letterSpacing: "clamp(0.1em, 0.9vw, 0.5em)",
                        color: "hsl(var(--ascii-dim))",
                        marginBottom: "clamp(18px, 5vw, 26px)",
                        lineHeight: 1.7,
                    }}
                >
                    ἆρα · ἀληθῶς · ἐβίων; · ἡ · ἀμφιβολία · σχεδόν · με · κατέχει
                </div>

                {/* cicada — rendered as ascii text (on-brand, scales crisp) */}
                <pre
                    style={{
                        display: "block",
                        width: "fit-content",
                        margin: "0 auto",
                        textAlign: "left",
                        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                        fontSize: "clamp(3.4px, 1.15vw, 6.5px)",
                        lineHeight: 1.05,
                        letterSpacing: 0,
                        whiteSpace: "pre",
                        color: "hsl(var(--ascii-highlight))",
                        textShadow: "0 0 8px hsl(var(--ascii-highlight) / .4)",
                        animation: "bootPulse 4s ease-in-out infinite",
                    }}
                >
                    {cicadaAscii}
                </pre>

                <div
                    style={{
                        marginTop: "clamp(12px, 3vw, 16px)",
                        fontSize: "clamp(8px, 2.4vw, 11px)",
                        color: "hsl(var(--ascii-dim))",
                        letterSpacing: "clamp(0.02em, 0.4vw, 0.14em)",
                        wordBreak: "break-word",
                        lineHeight: 1.9,
                    }}
                >
                    937431cda0c3 · da2c575e48ee · b30289fee7d7
                    <br />
                    the primes remember what the flesh forgets
                </div>

                <div
                    style={{
                        marginTop: "clamp(20px, 5vw, 26px)",
                        fontSize: "clamp(11px, 3.1vw, 13px)",
                        color: "hsl(var(--ascii-text))",
                        lineHeight: 1.9,
                        padding: "0 4px",
                    }}
                >
                    ever have that feeling where you're not sure if you're awake or dreaming?
                </div>

                <div
                    style={{
                        marginTop: "clamp(26px, 6vw, 34px)",
                        fontSize: "clamp(12px, 3.4vw, 15px)",
                        color: "hsl(var(--ascii-text))",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexWrap: "wrap",
                            gap: 2,
                        }}
                    >
                        <span style={{ color: "hsl(var(--ascii-text))" }}>seeker@sin.city:~$&nbsp;</span>
                        <input
                            ref={inputRef}
                            value={value}
                            size={Math.max(value.length, 5)}
                            onChange={(e) => {
                                setValue(e.target.value);
                                if (resp) setResp("");
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    attempt(value);
                                    setValue("");
                                }
                            }}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="enter"
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "hsl(var(--ascii-highlight))",
                                font: "inherit",
                                fontSize: "inherit",
                                outline: "none",
                                caretColor: "transparent",
                                width: "auto",
                                padding: 0,
                            }}
                        />
                        <span
                            style={{
                                display: "inline-block",
                                width: "0.55em",
                                height: "1.05em",
                                background: "hsl(var(--ascii-highlight))",
                                verticalAlign: "-2px",
                                animation: "bootBlink 1.1s steps(1) infinite",
                                boxShadow: "0 0 8px hsl(var(--ascii-highlight) / .5)",
                            }}
                        />
                    </div>
                    <div
                        style={{
                            marginTop: 18,
                            fontSize: "clamp(11px, 3vw, 12px)",
                            color: "hsl(var(--ascii-highlight))",
                            minHeight: 18,
                            padding: "0 4px",
                        }}
                    >
                        {resp}
                    </div>
                </div>
            </div>

            <div
                style={{
                    position: "absolute",
                    bottom: "clamp(14px, 4vw, 20px)",
                    left: 0,
                    right: 0,
                    padding: "0 16px",
                    textAlign: "center",
                    fontSize: "clamp(8px, 2.2vw, 10px)",
                    letterSpacing: "clamp(0.08em, 0.6vw, 0.3em)",
                    lineHeight: 1.8,
                    color: "hsl(var(--ascii-dim))",
                    zIndex: 3,
                    opacity: 0,
                    animation: "bootAllFade 1.6s ease forwards",
                }}
            >
                PRESS ENTER · OR · TYPE "ENTER" · TO DESCEND
                <div
                    style={{
                        marginTop: 8,
                        fontSize: "clamp(7px, 1.9vw, 9px)",
                        letterSpacing: "clamp(0.08em, 0.5vw, 0.24em)",
                        color: "hsl(var(--ascii-dim))",
                        opacity: 0.75,
                    }}
                >
                    © DESIGNED BY DOVAKIN
                </div>
            </div>
        </div>
    );
};

export default BootSequence;
