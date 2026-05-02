import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

const GRID_SIZE = 20;
const INITIAL_SPEED = 150;

type Point = { x: number; y: number };

export default function SnakeGame({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [snake, setSnake] = useState<Point[]>([
        { x: 10, y: 10 },
        { x: 10, y: 11 },
        { x: 10, y: 12 },
    ]);
    const [food, setFood] = useState<Point>({ x: 5, y: 5 });
    const [direction, setDirection] = useState<Point>({ x: 0, y: -1 });
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const directionRef = useRef(direction);

    const saveScore = async (finalScore: number) => {
        if (!user || finalScore === 0) return;
        try {
            await supabase.from('game_scores').insert({
                user_id: user.id,
                game_name: 'snake',
                score: finalScore
            });
            toast({ title: "Score Saved!", description: `Snake High Score: ${finalScore}` });
        } catch (e) {
            console.error("Failed to save score", e);
        }
    };

    const generateFood = useCallback((currentSnake: Point[]) => {
        let newFood: Point;
        while (true) {
            newFood = {
                x: Math.floor(Math.random() * GRID_SIZE),
                y: Math.floor(Math.random() * GRID_SIZE),
            };
            // Ensure food doesn't spawn on snake
            if (!currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y)) {
                break;
            }
        }
        return newFood;
    }, []);

    const resetGame = () => {
        const initialSnake = [
            { x: 10, y: 10 },
            { x: 10, y: 11 },
            { x: 10, y: 12 },
        ];
        setSnake(initialSnake);
        setDirection({ x: 0, y: -1 });
        directionRef.current = { x: 0, y: -1 };
        setFood(generateFood(initialSnake));
        setGameOver(false);
        setScore(0);
        setIsPaused(false);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (gameOver && e.key === 'Enter') {
                resetGame();
                return;
            }

            if (e.key === ' ') {
                setIsPaused(p => !p);
                return;
            }

            if (isPaused || gameOver) return;

            const currentDir = directionRef.current;
            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    if (currentDir.y !== 1) {
                        setDirection({ x: 0, y: -1 });
                        directionRef.current = { x: 0, y: -1 };
                    }
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    if (currentDir.y !== -1) {
                        setDirection({ x: 0, y: 1 });
                        directionRef.current = { x: 0, y: 1 };
                    }
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    if (currentDir.x !== 1) {
                        setDirection({ x: -1, y: 0 });
                        directionRef.current = { x: -1, y: 0 };
                    }
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    if (currentDir.x !== -1) {
                        setDirection({ x: 1, y: 0 });
                        directionRef.current = { x: 1, y: 0 };
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameOver, isPaused, onClose]);

    useEffect(() => {
        if (gameOver || isPaused) return;

        const moveSnake = () => {
            setSnake(prev => {
                const head = prev[0];
                const newHead = {
                    x: head.x + direction.x,
                    y: head.y + direction.y,
                };

                // Check collision with walls
                if (
                    newHead.x < 0 ||
                    newHead.x >= GRID_SIZE ||
                    newHead.y < 0 ||
                    newHead.y >= GRID_SIZE
                ) {
                    setGameOver(true);
                    saveScore(score);
                    return prev;
                }

                // Check collision with self
                if (prev.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
                    setGameOver(true);
                    saveScore(score);
                    return prev;
                }

                const newSnake = [newHead, ...prev];

                // Check food collection
                if (newHead.x === food.x && newHead.y === food.y) {
                    setScore(s => s + 10);
                    setFood(generateFood(newSnake));
                    // Don't pop the tail, so it grows
                } else {
                    newSnake.pop();
                }

                return newSnake;
            });
        };

        const speed = Math.max(50, INITIAL_SPEED - Math.floor(score / 50) * 10);
        const intervalId = setInterval(moveSnake, speed);

        return () => clearInterval(intervalId);
    }, [direction, food, gameOver, isPaused, score, generateFood]);

    return (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center font-mono backdrop-blur-sm">
            <div className="mb-4 text-center">
                <h2 className="text-green-500 text-2xl font-bold mb-2 tracking-widest uppercase">
                    Terminal.Snake
                </h2>
                <div className="flex justify-between w-full max-w-[400px] text-green-400 text-sm">
                    <span>SCORE: {score.toString().padStart(4, '0')}</span>
                    <span>{isPaused ? 'PAUSED' : 'PLAYING'}</span>
                </div>
            </div>

            <div 
                className="relative bg-black border-2 border-green-900 shadow-[0_0_15px_rgba(34,197,94,0.2)]"
                style={{ 
                    width: Math.min(window.innerWidth - 40, 400), 
                    height: Math.min(window.innerWidth - 40, 400) 
                }}
            >
                {/* Grid rendering */}
                <div 
                    className="absolute inset-0"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                        gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
                    }}
                >
                    {/* Food */}
                    <div
                        className="bg-red-500 rounded-sm"
                        style={{
                            gridColumnStart: food.x + 1,
                            gridRowStart: food.y + 1,
                            boxShadow: '0 0 8px rgba(239,68,68,0.8)'
                        }}
                    />
                    
                    {/* Snake */}
                    {snake.map((segment, i) => (
                        <div
                            key={`${segment.x}-${segment.y}-${i}`}
                            className={`${i === 0 ? 'bg-green-400' : 'bg-green-600'} border border-black/20 rounded-sm transition-colors`}
                            style={{
                                gridColumnStart: segment.x + 1,
                                gridRowStart: segment.y + 1,
                            }}
                        />
                    ))}
                </div>

                {/* Game Over Overlay */}
                {gameOver && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center backdrop-blur-sm z-10">
                        <h3 className="text-red-500 text-4xl font-bold mb-4 animate-pulse uppercase">Game Over</h3>
                        <p className="text-green-400 mb-2 font-bold text-xl">SCORE: {score}</p>
                        {!user && <p className="text-yellow-500 text-xs mb-4">Login to save your score to the leaderboard!</p>}
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
