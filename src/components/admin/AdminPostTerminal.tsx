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

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandHistory.length > 0) {
                const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
                setHistoryIndex(newIndex);
                setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setInput('');
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [commandHistory, historyIndex, onClose]);

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
                        {entry.content}
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
                <span className="text-green-400">$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
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
