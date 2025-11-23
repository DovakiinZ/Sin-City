import { useState } from "react";

interface TerminalCommandProps {
    onClose: () => void;
}

const TerminalCommand = ({ onClose }: TerminalCommandProps) => {
    const [input, setInput] = useState("");
    const [history, setHistory] = useState<string[]>([
        "SIN CITY Terminal v1.0",
        "Type 'help' for available commands",
        "",
    ]);

    const commands: Record<string, () => string> = {
        help: () => `Available commands:
  help     - Show this help message
  about    - About Sin City
  clear    - Clear terminal
  posts    - List recent posts
  whoami   - Display current user
  date     - Show current date/time
  exit     - Close terminal`,

        about: () => `SIN CITY - ASCII Blog Platform
Version: 1.0.0
Author: Dovakiin
Description: A retro terminal-themed blog
Built with: React + TypeScript + Vite`,

        clear: () => {
            setHistory([]);
            return "";
        },

        posts: () => `Recent Posts:
  1. Building ASCII Art Interfaces
  2. Retro Computing Showcase
  3. Terminal UI Tutorial
Use '/posts' route to view all`,

        whoami: () => localStorage.getItem("username") || "guest",

        date: () => new Date().toString(),

        exit: () => {
            onClose();
            return "Closing terminal...";
        },
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = input.trim().toLowerCase();

        if (!cmd) return;

        const output = commands[cmd]
            ? commands[cmd]()
            : `Command not found: ${cmd}. Type 'help' for available commands.`;

        setHistory([...history, `$ ${input}`, output, ""]);
        setInput("");
    };

    return (
        <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl ascii-box bg-background p-4">
                <div className="flex justify-between items-center mb-4">
                    <pre className="ascii-highlight">TERMINAL</pre>
                    <button
                        onClick={onClose}
                        className="ascii-text hover:ascii-highlight"
                    >
                        [X]
                    </button>
                </div>

                <div className="bg-black/50 p-4 h-96 overflow-y-auto mb-4 font-mono text-sm">
                    {history.map((line, i) => (
                        <pre key={i} className={line.startsWith("$") ? "ascii-highlight" : "ascii-text"}>
                            {line}
                        </pre>
                    ))}
                    <div className="flex items-center">
                        <span className="ascii-highlight mr-2">$</span>
                        <form onSubmit={handleSubmit} className="flex-1">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                className="bg-transparent border-none outline-none ascii-text w-full typing-cursor"
                                autoFocus
                                placeholder="Type a command..."
                            />
                        </form>
                    </div>
                </div>

                <pre className="ascii-dim text-xs">
                    {`Press 'Esc' to close | Type 'help' for commands`}
                </pre>
            </div>
        </div>
    );
};

export default TerminalCommand;
