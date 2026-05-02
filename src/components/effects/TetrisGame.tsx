import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

const COLS = 10;
const ROWS = 20;
const INITIAL_SPEED = 800;

const SHAPES = [
    [],
    [[1, 1, 1, 1]], // I
    [[1, 1], [1, 1]], // O
    [[0, 1, 0], [1, 1, 1]], // T
    [[1, 0, 0], [1, 1, 1]], // L
    [[0, 0, 1], [1, 1, 1]], // J
    [[0, 1, 1], [1, 1, 0]], // S
    [[1, 1, 0], [0, 1, 1]]  // Z
];

const COLORS = [
    'transparent',
    'bg-cyan-500', // I
    'bg-yellow-500', // O
    'bg-purple-500', // T
    'bg-orange-500', // L
    'bg-blue-500', // J
    'bg-green-500', // S
    'bg-red-500' // Z
];

const createEmptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

export default function TetrisGame({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [grid, setGrid] = useState(createEmptyGrid());
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    
    const [piece, setPiece] = useState<{shape: number[][], color: number, x: number, y: number} | null>(null);
    const pieceRef = useRef(piece);
    const gridRef = useRef(grid);

    // Sync refs
    useEffect(() => { pieceRef.current = piece; }, [piece]);
    useEffect(() => { gridRef.current = grid; }, [grid]);

    const spawnPiece = useCallback(() => {
        const typeId = Math.floor(Math.random() * 7) + 1;
        const newPiece = {
            shape: SHAPES[typeId],
            color: typeId,
            x: Math.floor(COLS / 2) - Math.floor(SHAPES[typeId][0].length / 2),
            y: 0
        };
        
        // Check game over immediately on spawn
        if (checkCollision(newPiece.shape, newPiece.x, newPiece.y, gridRef.current)) {
            setGameOver(true);
            saveScore(score);
            return null;
        }
        return newPiece;
    }, [score]);

    const saveScore = async (finalScore: number) => {
        if (!user || finalScore === 0) return;
        try {
            await supabase.from('game_scores').insert({
                user_id: user.id,
                game_name: 'tetris',
                score: finalScore
            });
            toast({ title: "Score Saved!", description: `Tetris High Score: ${finalScore}` });
        } catch (e) {
            console.error("Failed to save score", e);
        }
    };

    const resetGame = () => {
        setGrid(createEmptyGrid());
        setScore(0);
        setGameOver(false);
        setIsPaused(false);
        setPiece(spawnPiece());
    };

    useEffect(() => {
        setPiece(spawnPiece());
    }, [spawnPiece]);

    const checkCollision = (shape: number[][], x: number, y: number, currentGrid: number[][]) => {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] !== 0) {
                    const newX = x + c;
                    const newY = y + r;
                    if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && currentGrid[newY][newX] !== 0)) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    const mergePiece = () => {
        const p = pieceRef.current;
        const g = gridRef.current;
        if (!p) return;

        const newGrid = g.map(row => [...row]);
        for (let r = 0; r < p.shape.length; r++) {
            for (let c = 0; c < p.shape[r].length; c++) {
                if (p.shape[r][c] !== 0 && p.y + r >= 0) {
                    newGrid[p.y + r][p.x + c] = p.color;
                }
            }
        }

        // Clear lines
        let linesCleared = 0;
        const finalGrid = newGrid.filter(row => {
            if (row.every(cell => cell !== 0)) {
                linesCleared++;
                return false;
            }
            return true;
        });

        while (finalGrid.length < ROWS) {
            finalGrid.unshift(Array(COLS).fill(0));
        }

        if (linesCleared > 0) {
            const points = [0, 100, 300, 500, 800][linesCleared];
            setScore(s => s + points);
        }

        setGrid(finalGrid);
        setPiece(spawnPiece());
    };

    const moveDown = useCallback(() => {
        const p = pieceRef.current;
        if (!p || gameOver || isPaused) return;

        if (!checkCollision(p.shape, p.x, p.y + 1, gridRef.current)) {
            setPiece({ ...p, y: p.y + 1 });
        } else {
            mergePiece();
        }
    }, [gameOver, isPaused, spawnPiece]);

    useEffect(() => {
        if (gameOver || isPaused) return;
        const speed = Math.max(100, INITIAL_SPEED - Math.floor(score / 1000) * 100);
        const interval = setInterval(moveDown, speed);
        return () => clearInterval(interval);
    }, [moveDown, gameOver, isPaused, score]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') return onClose();
            if (gameOver && e.key === 'Enter') return resetGame();
            if (e.key === ' ') {
                e.preventDefault(); // Prevent scrolling
                return setIsPaused(p => !p);
            }

            const p = pieceRef.current;
            if (!p || gameOver || isPaused) return;

            switch (e.key) {
                case 'ArrowLeft':
                case 'a':
                    if (!checkCollision(p.shape, p.x - 1, p.y, gridRef.current)) {
                        setPiece({ ...p, x: p.x - 1 });
                    }
                    break;
                case 'ArrowRight':
                case 'd':
                    if (!checkCollision(p.shape, p.x + 1, p.y, gridRef.current)) {
                        setPiece({ ...p, x: p.x + 1 });
                    }
                    break;
                case 'ArrowDown':
                case 's':
                    moveDown();
                    break;
                case 'ArrowUp':
                case 'w': {
                    // Rotate
                    const rotated = p.shape[0].map((_, index) => p.shape.map(row => row[index]).reverse());
                    if (!checkCollision(rotated, p.x, p.y, gridRef.current)) {
                        setPiece({ ...p, shape: rotated });
                    }
                    break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameOver, isPaused, onClose, moveDown]);

    // Render grid with current piece superimposed
    const renderGrid = () => {
        const displayGrid = grid.map(row => [...row]);
        if (piece && !gameOver) {
            for (let r = 0; r < piece.shape.length; r++) {
                for (let c = 0; c < piece.shape[r].length; c++) {
                    if (piece.shape[r][c] !== 0) {
                        const y = piece.y + r;
                        if (y >= 0 && y < ROWS) {
                            displayGrid[y][piece.x + c] = piece.color;
                        }
                    }
                }
            }
        }
        return displayGrid;
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center font-mono backdrop-blur-sm">
            <div className="mb-4 text-center">
                <h2 className="text-blue-500 text-2xl font-bold mb-2 tracking-widest uppercase">
                    Terminal.Tetris
                </h2>
                <div className="flex justify-between w-full max-w-[300px] text-blue-400 text-sm mx-auto">
                    <span>SCORE: {score.toString().padStart(6, '0')}</span>
                    <span>{isPaused ? 'PAUSED' : 'PLAYING'}</span>
                </div>
            </div>

            <div className="relative bg-black border-4 border-blue-900 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                <div 
                    className="grid bg-blue-950/20"
                    style={{
                        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                        width: '300px',
                        height: '600px',
                    }}
                >
                    {renderGrid().map((row, rIdx) => 
                        row.map((cell, cIdx) => (
                            <div 
                                key={`${rIdx}-${cIdx}`}
                                className={`border-[0.5px] border-white/5 ${COLORS[cell]}`}
                                style={{
                                    boxShadow: cell !== 0 ? 'inset 0 0 8px rgba(0,0,0,0.3)' : 'none'
                                }}
                            />
                        ))
                    )}
                </div>

                {gameOver && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center">
                        <h3 className="text-red-500 text-4xl font-bold mb-4 animate-pulse uppercase">Game Over</h3>
                        <p className="text-blue-400 mb-2 font-bold text-xl">SCORE: {score}</p>
                        {!user && <p className="text-yellow-500 text-xs mb-4">Login to save your score to the leaderboard!</p>}
                        <p className="text-gray-500 text-sm mt-4">[ ENTER ] to restart</p>
                    </div>
                )}
            </div>

            <div className="mt-8 text-gray-500 text-xs text-center space-y-2">
                <p>[↑]/[W] to Rotate • [↓]/[S] to Drop</p>
                <p>[←][→] or [A][D] to Move</p>
                <p>[SPACE] to pause • [ESC] to exit</p>
            </div>
        </div>
    );
}
