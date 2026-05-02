import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

const GRID_SIZE = 19;
const INITIAL_SPEED = 200;

type Point = { x: number; y: number };

// 0: empty, 1: wall, 2: dot, 3: power pellet
const INITIAL_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
    [1,3,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,3,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,2,1],
    [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
    [1,1,1,1,2,1,1,1,0,1,0,1,1,1,2,1,1,1,1],
    [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
    [1,1,1,1,2,1,0,1,1,0,1,1,0,1,2,1,1,1,1],
    [2,2,2,2,2,0,0,1,0,0,0,1,0,0,2,2,2,2,2],
    [1,1,1,1,2,1,0,1,1,1,1,1,0,1,2,1,1,1,1],
    [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
    [1,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
    [1,3,2,1,2,2,2,2,2,0,2,2,2,2,2,1,2,3,1],
    [1,1,2,1,2,1,2,1,1,1,1,1,2,1,2,1,2,1,1],
    [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export default function PacmanGame({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();

    const [map, setMap] = useState<number[][]>(INITIAL_MAP.map(row => [...row]));
    const [pacman, setPacman] = useState<Point>({ x: 9, y: 15 });
    const [direction, setDirection] = useState<Point>({ x: 0, y: 0 });
    const [nextDirection, setNextDirection] = useState<Point>({ x: 0, y: 0 });
    
    // Ghost: simplified to just one or two ghosts moving randomly/rudimentarily
    const [ghosts, setGhosts] = useState<Point[]>([{ x: 9, y: 9 }, { x: 8, y: 9 }]);
    
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [victory, setVictory] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    const pacmanRef = useRef(pacman);
    const dirRef = useRef(direction);
    const mapRef = useRef(map);

    useEffect(() => { pacmanRef.current = pacman; }, [pacman]);
    useEffect(() => { dirRef.current = direction; }, [direction]);
    useEffect(() => { mapRef.current = map; }, [map]);

    const saveScore = async (finalScore: number) => {
        if (!user || finalScore === 0) return;
        try {
            await supabase.from('game_scores').insert({
                user_id: user.id,
                game_name: 'pacman',
                score: finalScore
            });
            toast({ title: "Score Saved!", description: `Pacman High Score: ${finalScore}` });
        } catch (e) {
            console.error("Failed to save score", e);
        }
    };

    const resetGame = () => {
        setMap(INITIAL_MAP.map(row => [...row]));
        setPacman({ x: 9, y: 15 });
        setDirection({ x: 0, y: 0 });
        setNextDirection({ x: 0, y: 0 });
        setGhosts([{ x: 9, y: 9 }, { x: 8, y: 9 }]);
        setScore(0);
        setGameOver(false);
        setVictory(false);
        setIsPaused(false);
    };

    const checkWall = (x: number, y: number) => {
        // Wrap around logic
        if (x < 0) x = GRID_SIZE - 1;
        if (x >= GRID_SIZE) x = 0;
        if (y < 0 || y >= GRID_SIZE) return true; // Shouldn't happen in this map
        return mapRef.current[y][x] === 1;
    };

    const moveEntities = useCallback(() => {
        if (gameOver || victory || isPaused) return;

        // Try applying next direction
        let currentDir = dirRef.current;
        if (nextDirection.x !== 0 || nextDirection.y !== 0) {
            let nX = pacmanRef.current.x + nextDirection.x;
            let nY = pacmanRef.current.y + nextDirection.y;
            if (nX < 0) nX = GRID_SIZE - 1;
            if (nX >= GRID_SIZE) nX = 0;
            if (!checkWall(nX, nY)) {
                currentDir = nextDirection;
                setDirection(nextDirection);
                setNextDirection({ x: 0, y: 0 });
            }
        }

        // Move Pacman
        let pX = pacmanRef.current.x + currentDir.x;
        let pY = pacmanRef.current.y + currentDir.y;
        
        if (pX < 0) pX = GRID_SIZE - 1;
        if (pX >= GRID_SIZE) pX = 0;

        if (!checkWall(pX, pY)) {
            setPacman({ x: pX, y: pY });

            // Eat dots
            const cell = mapRef.current[pY][pX];
            if (cell === 2 || cell === 3) {
                const newMap = mapRef.current.map(row => [...row]);
                newMap[pY][pX] = 0;
                setMap(newMap);
                setScore(s => s + (cell === 2 ? 10 : 50));
            }
        }

        // Move Ghosts (Random walk logic for simplicity)
        setGhosts(prevGhosts => prevGhosts.map(g => {
            const dirs = [
                {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}
            ];
            // Filter out walls
            const validDirs = dirs.filter(d => !checkWall(g.x + d.x, g.y + d.y));
            if (validDirs.length > 0) {
                const move = validDirs[Math.floor(Math.random() * validDirs.length)];
                let gX = g.x + move.x;
                let gY = g.y + move.y;
                if (gX < 0) gX = GRID_SIZE - 1;
                if (gX >= GRID_SIZE) gX = 0;
                return { x: gX, y: gY };
            }
            return g;
        }));

    }, [gameOver, victory, isPaused, nextDirection]);

    useEffect(() => {
        // Check win condition
        const dotsLeft = map.some(row => row.includes(2) || row.includes(3));
        if (!dotsLeft && score > 0) {
            setVictory(true);
            saveScore(score + 1000); // Bonus for win
        }
    }, [map, score]);

    useEffect(() => {
        // Check collisions
        if (ghosts.some(g => g.x === pacman.x && g.y === pacman.y)) {
            if (!gameOver) {
                setGameOver(true);
                saveScore(score);
            }
        }
    }, [pacman, ghosts, gameOver, score]);

    useEffect(() => {
        if (gameOver || victory || isPaused) return;
        const interval = setInterval(moveEntities, INITIAL_SPEED);
        return () => clearInterval(interval);
    }, [moveEntities, gameOver, victory, isPaused]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') return onClose();
            if ((gameOver || victory) && e.key === 'Enter') return resetGame();
            if (e.key === ' ') {
                e.preventDefault();
                return setIsPaused(p => !p);
            }

            if (gameOver || victory || isPaused) return;

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                    setNextDirection({ x: 0, y: -1 }); break;
                case 'ArrowDown':
                case 's':
                    setNextDirection({ x: 0, y: 1 }); break;
                case 'ArrowLeft':
                case 'a':
                    setNextDirection({ x: -1, y: 0 }); break;
                case 'ArrowRight':
                case 'd':
                    setNextDirection({ x: 1, y: 0 }); break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameOver, victory, isPaused, onClose]);

    return (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center font-mono backdrop-blur-sm">
            <div className="mb-4 text-center">
                <h2 className="text-yellow-400 text-2xl font-bold mb-2 tracking-widest uppercase">
                    Terminal.Pacman
                </h2>
                <div className="flex justify-between w-full max-w-[400px] text-yellow-500/80 text-sm mx-auto">
                    <span>SCORE: {score.toString().padStart(5, '0')}</span>
                    <span>{isPaused ? 'PAUSED' : 'PLAYING'}</span>
                </div>
            </div>

            <div 
                className="relative bg-black border-4 border-yellow-900 shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                style={{
                    width: Math.min(window.innerWidth - 40, 400),
                    height: Math.min(window.innerWidth - 40, 400)
                }}
            >
                <div 
                    className="absolute inset-0"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                        gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
                    }}
                >
                    {map.map((row, y) => 
                        row.map((cell, x) => {
                            if (cell === 1) return <div key={`${x}-${y}`} className="bg-blue-900/40 border border-blue-500/20" />;
                            if (cell === 2) return <div key={`${x}-${y}`} className="flex items-center justify-center"><div className="w-1.5 h-1.5 bg-yellow-200/50 rounded-full" /></div>;
                            if (cell === 3) return <div key={`${x}-${y}`} className="flex items-center justify-center"><div className="w-3 h-3 bg-yellow-200 rounded-full animate-pulse" /></div>;
                            return <div key={`${x}-${y}`} />;
                        })
                    )}
                    
                    {/* Pacman */}
                    <div 
                        className="bg-yellow-400 rounded-full flex items-center justify-center transition-all duration-200 ease-linear"
                        style={{
                            gridColumnStart: pacman.x + 1,
                            gridRowStart: pacman.y + 1,
                            boxShadow: '0 0 10px rgba(250,204,21,0.5)',
                            transform: `scale(0.8) ${direction.x === -1 ? 'rotate(180deg)' : direction.y === -1 ? 'rotate(-90deg)' : direction.y === 1 ? 'rotate(90deg)' : 'rotate(0deg)'}`
                        }}
                    >
                        <div className="w-1/2 h-[2px] bg-black translate-x-1/4"></div>
                    </div>

                    {/* Ghosts */}
                    {ghosts.map((g, i) => (
                        <div 
                            key={`ghost-${i}`}
                            className={`${i % 2 === 0 ? 'bg-red-500' : 'bg-pink-500'} rounded-t-full transition-all duration-200 ease-linear flex items-start justify-center pt-1`}
                            style={{
                                gridColumnStart: g.x + 1,
                                gridRowStart: g.y + 1,
                                transform: 'scale(0.8)'
                            }}
                        >
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-white rounded-full"><div className="w-0.5 h-0.5 bg-blue-900 ml-0.5 mt-0.5"></div></div>
                                <div className="w-1.5 h-1.5 bg-white rounded-full"><div className="w-0.5 h-0.5 bg-blue-900 ml-0.5 mt-0.5"></div></div>
                            </div>
                        </div>
                    ))}
                </div>

                {(gameOver || victory) && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center backdrop-blur-sm z-10">
                        {victory ? (
                            <h3 className="text-yellow-400 text-4xl font-bold mb-4 animate-bounce">LEVEL CLEARED!</h3>
                        ) : (
                            <h3 className="text-red-500 text-4xl font-bold mb-4 animate-pulse">GAME OVER</h3>
                        )}
                        <p className="text-yellow-200 mb-2 font-bold text-xl">SCORE: {score}</p>
                        {!user && <p className="text-yellow-600 text-xs mb-4">Login to save your score to the leaderboard!</p>}
                        <p className="text-gray-500 text-sm mt-4">[ ENTER ] to restart</p>
                    </div>
                )}
            </div>

            <div className="mt-8 text-gray-500 text-xs text-center space-y-2">
                <p>[W][A][S][D] or ARROWS to move</p>
                <p>[SPACE] to pause • [ESC] to exit</p>
            </div>
        </div>
    );
}
