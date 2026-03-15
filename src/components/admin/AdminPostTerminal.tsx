import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useAdminTerminal } from '@/hooks/useAdminTerminal';
import { Terminal, X, Minus, Maximize2, Minimize2 } from 'lucide-react';
import GraphVisualization from './GraphVisualization';

interface AdminPostTerminalProps {
    postId: string;
    userId?: string | null;
    guestId?: string | null;
    onClose: () => void;
}

interface HistoryEntry {
    type: 'input' | 'output' | 'error' | 'success';
    content: string;
}

interface GraphData {
    entity_id: string;
    entity_type: string;
    nodes: any[];
    edges: any[];
    node_count: number;
    edge_count: number;
}

// Helper to format output with clickable links
const formatContent = (text: string, onCommand: (cmd: string) => void) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        // Regex for IP Address
        const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
        // Regex for UUID (Guest ID / User ID / Post ID)
        const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
        // Regex for Username
        const userRegex = /@(\w+)/g;

        const parts: React.ReactNode[] = [];
        let lastIndex = 0;

        // processing logic would be complex with multiple regexes. 
        // Simple approach: Split by space and check each word
        const words = line.split(/(\s+)/);

        return (
            <div key={i} className="min-h-[1.2em]">
                {words.map((word, wIndex) => {
                    if (word.match(ipRegex)) {
                        return (
                            <span
                                key={wIndex}
                                onClick={() => onCommand(`trace ip ${word}`)}
                                className="text-blue-400 hover:underline cursor-pointer hover:text-blue-300"
                                title="Click to trace IP"
                            >
                                {word}
                            </span>
                        );
                    }
                    if (word.match(uuidRegex)) {
                        return (
                            <span
                                key={wIndex}
                                onClick={() => onCommand(`timeline ${word}`)}
                                className="text-purple-400 hover:underline cursor-pointer hover:text-purple-300"
                                title="Click to view timeline"
                            >
                                {word}
                            </span>
                        );
                    }
                    if (word.startsWith('@')) {
                        // Just style for now
                        return <span key={wIndex} className="text-yellow-400">{word}</span>;
                    }
                    return <span key={wIndex}>{word}</span>;
                })}
            </div>
        );
    });
};

const AVAILABLE_COMMANDS = [
    'help', 'clear', 'exit', 'whoami',
    'sudo user --full', 'sudo anon --trace', 'sudo post --history', 'sudo risk --scan',
    'sudo action --ban', 'sudo action --unban', 'sudo action --restrict', 'sudo action --verify',
    'auto-investigate anon', 'explain risk', 'suggest action', 'timeline', 'trace ip', 'graph',
    'auto-investigate', 'suggest'
];

export default function AdminPostTerminal({
    postId,
    userId,
    guestId,
    onClose
}: AdminPostTerminalProps) {
    const { user } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [input, setInput] = useState('');
    const [history, setHistory] = useState<HistoryEntry[]>([
        { type: 'output', content: '╔══════════════════════════════════════════════════════════' },
        { type: 'output', content: '║  SIN CITY ADMIN TERMINAL v1.0' },
        { type: 'output', content: '║  Type "help" for available commands' },
        { type: 'output', content: '╚══════════════════════════════════════════════════════════' },
        { type: 'output', content: '' },
    ]);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Auto-complete state
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

    const [isMinimized, setIsMinimized] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [graphData, setGraphData] = useState<GraphData | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);
    const terminalRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const { executeCommand, isLoading: commandLoading } = useAdminTerminal({
        postId,
        userId,
        guestId
    });

    // Check if user is admin
    useEffect(() => {
        const checkAdmin = async () => {
            if (!user) {
                setIsAdmin(false);
                setIsLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (!error && data?.role === 'admin') {
                    setIsAdmin(true);
                } else {
                    setIsAdmin(false);
                }
            } catch {
                setIsAdmin(false);
            } finally {
                setIsLoading(false);
            }
        };

        checkAdmin();
    }, [user]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [history]);

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current && !isMinimized) {
            inputRef.current.focus();
        }
    }, [isMinimized]);

    // Handle command submission
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || commandLoading) return;

        const cmd = input.trim();
        setInput('');
        setCommandHistory(prev => [...prev, cmd]);
        setHistoryIndex(-1);

        // Add input to history
        setHistory(prev => [...prev, { type: 'input', content: `$ ${cmd}` }]);

        // Execute command
        const result = await executeCommand(cmd);

        // Handle special commands
        if (result.output === '__CLEAR__') {
            setHistory([]);
            return;
        }

        if (result.output === '__EXIT__') {
            onClose();
            return;
        }

        // Handle graph visualization
        if (result.output === '__GRAPH__' && result.graphData) {
            setGraphData(result.graphData);
            setHistory(prev => [
                ...prev,
                { type: 'output', content: `Loading graph for ${result.graphData.entity_type}...` }
            ]);
            return;
        }

        // Add output to history
        setHistory(prev => [
            ...prev,
            {
                type: result.isError ? 'error' : result.isSuccess ? 'success' : 'output',
                content: result.output
            }
        ]);
    }, [input, commandLoading, executeCommand, onClose]);

    // Handle Input Change & Auto-complete
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInput(val);

        if (!val.trim()) {
            setSuggestions([]);
            return;
        }

        const matching = AVAILABLE_COMMANDS.filter(cmd =>
            cmd.toLowerCase().startsWith(val.toLowerCase()) &&
            cmd.toLowerCase() !== val.toLowerCase()
        ).slice(0, 5); // Limit suggestions

        setSuggestions(matching);
        setSelectedSuggestionIndex(0);
    };

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Tab or Right Arrow for autocomplete
        if (suggestions.length > 0) {
            const target = e.currentTarget as HTMLInputElement;
            if (e.key === 'Tab' || (e.key === 'ArrowRight' && target.selectionStart === input.length)) {
                e.preventDefault();
                setInput(suggestions[selectedSuggestionIndex]);
                setSuggestions([]);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => (prev + 1) % suggestions.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                return;
            }
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandHistory.length > 0) {
                const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
                setHistoryIndex(newIndex);
                setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
                setSuggestions([]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
                setSuggestions([]);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setInput('');
                setSuggestions([]);
            }
        } else if (e.key === 'Escape') {
            if (suggestions.length > 0) {
                setSuggestions([]);
            } else {
                onClose();
            }
        }
    }, [commandHistory, historyIndex, onClose, suggestions, selectedSuggestionIndex, input]);

    // Focus terminal when clicked
    const handleTerminalClick = useCallback(() => {
        if (inputRef.current && !isMinimized) {
            inputRef.current.focus();
        }
    }, [isMinimized]);

    // Don't render if not admin
    if (isLoading) {
        return null;
    }

    if (!isAdmin) {
        return null;
    }

    // Minimized state
    if (isMinimized) {
        return (
            <div
                className="fixed bottom-4 right-4 z-50"
                onClick={() => setIsMinimized(false)}
            >
                <button className="flex items-center gap-2 bg-black border border-green-500/50 rounded px-3 py-2 text-green-400 hover:bg-green-900/20 transition-colors shadow-lg shadow-green-500/10">
                    <Terminal className="w-4 h-4" />
                    <span className="text-sm font-mono">Admin Terminal</span>
                </button>
            </div>
        );
    }

    // Terminal container styles
    const containerClasses = isMaximized
        ? 'fixed inset-0 z-50'
        : 'fixed bottom-0 left-0 right-0 z-50 h-80 md:h-96';

    return (
        <div
            className={`${containerClasses} bg-black/95 border-t border-green-500/30 font-mono text-sm`}
            onClick={handleTerminalClick}
        >
            {/* Scanline overlay effect */}
            <div
                className="absolute inset-0 pointer-events-none opacity-5"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,255,0,0.03) 2px, rgba(0,255,0,0.03) 3px)',
                    backgroundSize: '100% 3px'
                }}
            />

            {/* Terminal header */}
            <div className="flex items-center justify-between px-4 py-2 bg-green-900/20 border-b border-green-500/30">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 text-xs">
                        ADMIN TERMINAL - Post: {postId.substring(0, 8)}...
                    </span>
                    <span className="text-yellow-500 text-xs">[ADMIN ONLY]</span>
                </div>
                <div className="flex items-center gap-1">
                    {/* Minimize button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMinimized(true);
                        }}
                        className="p-1 hover:bg-green-500/20 rounded transition-colors"
                        title="Minimize"
                    >
                        <Minus className="w-4 h-4 text-green-400" />
                    </button>
                    {/* Maximize/Restore button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMaximized(!isMaximized);
                        }}
                        className="p-1 hover:bg-green-500/20 rounded transition-colors"
                        title={isMaximized ? 'Restore' : 'Maximize'}
                    >
                        {isMaximized ? (
                            <Minimize2 className="w-4 h-4 text-green-400" />
                        ) : (
                            <Maximize2 className="w-4 h-4 text-green-400" />
                        )}
                    </button>
                    {/* Close button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className="p-1 hover:bg-red-500/20 rounded transition-colors"
                        title="Close (Esc)"
                    >
                        <X className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            </div>

            {/* Terminal body */}
            <div
                ref={terminalRef}
                className="h-[calc(100%-80px)] overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-green-700 scrollbar-track-transparent"
            >
                {history.map((entry, i) => (
                    <div
                        key={i}
                        className={`whitespace-pre-wrap mb-0.5 ${entry.type === 'input'
                            ? 'text-green-300'
                            : entry.type === 'error'
                                ? 'text-red-400'
                                : entry.type === 'success'
                                    ? 'text-green-400'
                                    : 'text-green-500/80'
                            }`}
                    >
                        {formatContent(entry.content, (cmd) => {
                            setInput(cmd);
                            if (inputRef.current) inputRef.current.focus();
                        })}
                    </div>
                ))}

                {/* Graph Visualization */}
                {graphData && (
                    <div className="my-4">
                        <GraphVisualization
                            nodes={graphData.nodes}
                            edges={graphData.edges}
                            entityId={graphData.entity_id}
                            entityType={graphData.entity_type}
                            onClose={() => setGraphData(null)}
                        />
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input line */}
            <form
                onSubmit={handleSubmit}
                className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-4 py-3 bg-black/80 border-t border-green-500/20"
            >
                {/* Auto-complete suggestions */}
                {suggestions.length > 0 && (
                    <div className="absolute bottom-full left-4 mb-2 w-64 bg-black/95 border border-green-500/50 rounded shadow-lg overflow-hidden">
                        {suggestions.map((cmd, i) => (
                            <div
                                key={cmd}
                                className={`px-3 py-1.5 cursor-pointer font-mono text-sm border-b border-green-500/10 last:border-0 ${i === selectedSuggestionIndex
                                        ? 'bg-green-900/40 text-green-300'
                                        : 'text-gray-400 hover:bg-green-900/20'
                                    }`}
                                onClick={() => {
                                    setInput(cmd);
                                    setSuggestions([]);
                                    if (inputRef.current) inputRef.current.focus();
                                }}
                            >
                                {cmd}
                            </div>
                        ))}
                    </div>
                )}

                <span className="text-green-400">$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    disabled={commandLoading}
                    placeholder={commandLoading ? 'Processing...' : 'Enter command...'}
                    className="flex-1 bg-transparent text-green-300 outline-none placeholder-green-700 caret-green-400"
                    autoComplete="off"
                    spellCheck={false}
                />
                {commandLoading && (
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                )}
            </form>
        </div>
    );
}
