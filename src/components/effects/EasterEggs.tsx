import { useState, useEffect } from 'react';
import SnakeGame from './SnakeGame';
import TetrisGame from './TetrisGame';
import PacmanGame from './PacmanGame';
import HackOverlay from './HackOverlay';
import MatrixRain from './MatrixRain';

type EasterEggEvent = {
    type: 'snake' | 'tetris' | 'pacman' | 'hack' | 'matrix';
    target?: string;
};

export default function EasterEggs() {
    const [activeEgg, setActiveEgg] = useState<EasterEggEvent | null>(null);

    useEffect(() => {
        const handleEgg = (e: Event) => {
            const customEvent = e as CustomEvent<EasterEggEvent>;
            setActiveEgg(customEvent.detail);
        };

        window.addEventListener('trigger-easter-egg', handleEgg);
        return () => window.removeEventListener('trigger-easter-egg', handleEgg);
    }, []);

    if (!activeEgg) return null;

    const closeEgg = () => setActiveEgg(null);

    return (
        <>
            {activeEgg.type === 'snake' && <SnakeGame onClose={closeEgg} />}
            {activeEgg.type === 'tetris' && <TetrisGame onClose={closeEgg} />}
            {activeEgg.type === 'pacman' && <PacmanGame onClose={closeEgg} />}
            {activeEgg.type === 'hack' && <HackOverlay target={activeEgg.target || 'unknown'} onClose={closeEgg} />}
            {activeEgg.type === 'matrix' && (
                <div 
                    className="fixed inset-0 z-[1000] cursor-pointer" 
                    onClick={closeEgg}
                    title="Click anywhere to exit Matrix"
                >
                    <MatrixRain />
                    <div className="absolute bottom-4 w-full text-center text-green-500 font-mono animate-pulse">
                        Click anywhere or press ESC to exit
                    </div>
                </div>
            )}
        </>
    );
}
