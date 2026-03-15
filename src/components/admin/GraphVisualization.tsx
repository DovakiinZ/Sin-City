import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';

interface GraphNode {
    id: string;
    label: string;
    type: 'guest' | 'user' | 'post' | 'comment' | 'ip' | 'related_guest' | 'follower' | 'following';
    data?: Record<string, any>;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

interface GraphEdge {
    source: string;
    target: string;
    type: 'posted' | 'commented' | 'used_ip' | 'shared_ip' | 'follows';
}

interface GraphVisualizationProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    onClose: () => void;
    entityId: string;
    entityType: string;
}

// Node colors by type
const NODE_COLORS: Record<string, string> = {
    guest: '#10b981',      // green
    user: '#3b82f6',       // blue
    post: '#f59e0b',       // amber
    comment: '#8b5cf6',    // purple
    ip: '#ef4444',         // red
    related_guest: '#6b7280', // gray
    follower: '#06b6d4',   // cyan
    following: '#ec4899',  // pink
};

// Edge colors by type
const EDGE_COLORS: Record<string, string> = {
    posted: '#f59e0b',
    commented: '#8b5cf6',
    used_ip: '#ef4444',
    shared_ip: '#ff6b6b',
    follows: '#3b82f6',
};

export default function GraphVisualization({ nodes, edges, onClose, entityId, entityType }: GraphVisualizationProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [simulatedNodes, setSimulatedNodes] = useState<GraphNode[]>([]);

    // Initialize node positions with force simulation
    useEffect(() => {
        if (nodes.length === 0) return;

        const width = containerRef.current?.clientWidth || 600;
        const height = containerRef.current?.clientHeight || 400;
        const centerX = width / 2;
        const centerY = height / 2;

        // Initialize positions in a circle around center
        const initialNodes = nodes.map((node, i) => {
            const angle = (2 * Math.PI * i) / nodes.length;
            const radius = Math.min(width, height) / 3;
            return {
                ...node,
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
                vx: 0,
                vy: 0,
            };
        });

        // Simple force simulation
        const simulate = (nodeList: GraphNode[]) => {
            const iterations = 50;
            const repulsion = 5000;
            const attraction = 0.01;
            const damping = 0.8;

            for (let iter = 0; iter < iterations; iter++) {
                // Repulsion between all nodes
                for (let i = 0; i < nodeList.length; i++) {
                    for (let j = i + 1; j < nodeList.length; j++) {
                        const dx = nodeList[j].x! - nodeList[i].x!;
                        const dy = nodeList[j].y! - nodeList[i].y!;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const force = repulsion / (dist * dist);
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;
                        nodeList[i].vx! -= fx;
                        nodeList[i].vy! -= fy;
                        nodeList[j].vx! += fx;
                        nodeList[j].vy! += fy;
                    }
                }

                // Attraction along edges
                for (const edge of edges) {
                    const source = nodeList.find(n => n.id === edge.source);
                    const target = nodeList.find(n => n.id === edge.target);
                    if (source && target) {
                        const dx = target.x! - source.x!;
                        const dy = target.y! - source.y!;
                        const fx = dx * attraction;
                        const fy = dy * attraction;
                        source.vx! += fx;
                        source.vy! += fy;
                        target.vx! -= fx;
                        target.vy! -= fy;
                    }
                }

                // Center gravity
                for (const node of nodeList) {
                    node.vx! += (centerX - node.x!) * 0.001;
                    node.vy! += (centerY - node.y!) * 0.001;
                }

                // Apply velocity with damping
                for (const node of nodeList) {
                    node.vx! *= damping;
                    node.vy! *= damping;
                    node.x! += node.vx!;
                    node.y! += node.vy!;
                    // Bounds
                    node.x = Math.max(50, Math.min(width - 50, node.x!));
                    node.y = Math.max(50, Math.min(height - 50, node.y!));
                }
            }

            return nodeList;
        };

        const simulated = simulate(initialNodes);
        setSimulatedNodes(simulated);
    }, [nodes, edges]);

    // Draw the graph
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || simulatedNodes.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        // Apply transform
        ctx.save();
        ctx.translate(offset.x, offset.y);
        ctx.scale(zoom, zoom);

        // Draw edges
        for (const edge of edges) {
            const source = simulatedNodes.find(n => n.id === edge.source);
            const target = simulatedNodes.find(n => n.id === edge.target);
            if (source && target) {
                ctx.beginPath();
                ctx.strokeStyle = EDGE_COLORS[edge.type] || '#444';
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.6;
                ctx.moveTo(source.x!, source.y!);
                ctx.lineTo(target.x!, target.y!);
                ctx.stroke();
                ctx.globalAlpha = 1;

                // Arrow
                const angle = Math.atan2(target.y! - source.y!, target.x! - source.x!);
                const arrowLen = 8;
                const midX = (source.x! + target.x!) / 2;
                const midY = (source.y! + target.y!) / 2;
                ctx.beginPath();
                ctx.moveTo(midX, midY);
                ctx.lineTo(
                    midX - arrowLen * Math.cos(angle - Math.PI / 6),
                    midY - arrowLen * Math.sin(angle - Math.PI / 6)
                );
                ctx.moveTo(midX, midY);
                ctx.lineTo(
                    midX - arrowLen * Math.cos(angle + Math.PI / 6),
                    midY - arrowLen * Math.sin(angle + Math.PI / 6)
                );
                ctx.stroke();
            }
        }

        // Draw nodes
        for (const node of simulatedNodes) {
            const radius = node.id === entityId ? 25 : 18;
            const color = NODE_COLORS[node.type] || '#888';

            // Glow for main node
            if (node.id === entityId) {
                ctx.beginPath();
                ctx.arc(node.x!, node.y!, radius + 8, 0, Math.PI * 2);
                ctx.fillStyle = color + '33';
                ctx.fill();
            }

            // Node circle
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, radius, 0, Math.PI * 2);
            ctx.fillStyle = selectedNode?.id === node.id ? '#fff' : color;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label
            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = node.label.length > 12 ? node.label.substring(0, 12) + '...' : node.label;
            ctx.fillText(label, node.x!, node.y! + radius + 14);

            // Type badge
            ctx.font = '8px monospace';
            ctx.fillStyle = '#888';
            ctx.fillText(node.type.toUpperCase(), node.x!, node.y! + radius + 24);
        }

        ctx.restore();

        // Legend
        ctx.fillStyle = '#fff';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        let legendY = 20;
        ctx.fillText('LEGEND:', 10, legendY);
        for (const [type, color] of Object.entries(NODE_COLORS)) {
            legendY += 16;
            ctx.fillStyle = color;
            ctx.fillRect(10, legendY - 8, 10, 10);
            ctx.fillStyle = '#888';
            ctx.fillText(type, 25, legendY);
        }
    }, [simulatedNodes, edges, zoom, offset, selectedNode, entityId]);

    // Redraw on changes
    useEffect(() => {
        draw();
    }, [draw]);

    // Resize canvas
    useEffect(() => {
        const resize = () => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (canvas && container) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
                draw();
            }
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [draw, isFullscreen]);

    // Mouse handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setOffset({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleClick = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - offset.x) / zoom;
        const y = (e.clientY - rect.top - offset.y) / zoom;

        // Find clicked node
        const clicked = simulatedNodes.find(node => {
            const dx = x - node.x!;
            const dy = y - node.y!;
            return Math.sqrt(dx * dx + dy * dy) < 25;
        });

        setSelectedNode(clicked || null);
    };

    return (
        <div
            ref={containerRef}
            className={`${isFullscreen ? 'fixed inset-0 z-50' : 'w-full h-[500px]'} bg-black/95 border border-green-900/50 rounded-lg overflow-hidden`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-green-900/30">
                <div className="flex items-center gap-2">
                    <span className="text-green-500 font-mono text-sm">
                        🕸️ GRAPH: {entityType} / {entityId.substring(0, 8)}
                    </span>
                    <span className="text-gray-500 text-xs">
                        {nodes.length} nodes • {edges.length} edges
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setZoom(z => Math.min(3, z + 0.2))}
                        className="p-1 text-gray-400 hover:text-green-400"
                        title="Zoom In"
                    >
                        <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}
                        className="p-1 text-gray-400 hover:text-green-400"
                        title="Zoom Out"
                    >
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
                        className="p-1 text-gray-400 hover:text-green-400"
                        title="Reset View"
                    >
                        <Move className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1 text-gray-400 hover:text-green-400"
                        title="Toggle Fullscreen"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-red-400"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleClick}
            />

            {/* Selected Node Info */}
            {selectedNode && (
                <div className="absolute bottom-4 left-4 bg-black/90 border border-green-900/50 rounded-lg p-3 max-w-xs">
                    <div className="font-mono text-green-400 text-sm mb-1">
                        {selectedNode.label}
                    </div>
                    <div className="text-gray-400 text-xs">
                        Type: {selectedNode.type}
                    </div>
                    {selectedNode.data && Object.entries(selectedNode.data).map(([key, value]) => (
                        <div key={key} className="text-gray-500 text-xs">
                            {key}: {String(value)}
                        </div>
                    ))}
                </div>
            )}

            {/* Instructions */}
            <div className="absolute bottom-4 right-4 text-gray-600 text-xs font-mono">
                Drag to pan • Scroll to zoom • Click nodes to inspect
            </div>
        </div>
    );
}
