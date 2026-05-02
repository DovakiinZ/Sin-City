import { useState, useEffect } from 'react';

export default function HackOverlay({ target, onClose }: { target: string, onClose: () => void }) {
    const [lines, setLines] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState<'init' | 'hacking' | 'dumping' | 'done'>('init');

    useEffect(() => {
        let mounted = true;

        const sequence = async () => {
            const addLine = (line: string, delay: number) => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        if (mounted) {
                            setLines(prev => [...prev, line]);
                            resolve(null);
                        }
                    }, delay);
                });
            };

            await addLine(`[SYS] Initiating unauthorized sequence targeting: @${target}...`, 300);
            await addLine(`[SYS] Bypassing mainframe firewall...`, 400);
            
            setPhase('hacking');

            // Simulate progress bar
            for (let i = 0; i <= 100; i += 10) {
                if (!mounted) return;
                setProgress(i);
                await new Promise(r => setTimeout(r, 150));
            }

            setPhase('dumping');
            await addLine(`[SUCCESS] Access Granted. Extracting payload...`, 200);
            await addLine(`--- CLASSIFIED DOSSIER: @${target} ---`, 500);
            await addLine(`UID: 0x${Math.random().toString(16).substring(2, 10).toUpperCase()}`, 100);
            await addLine(`STATUS: COMPROMISED`, 100);
            await addLine(`CLEARANCE: LEVEL 1`, 100);
            await addLine(`LAST LOGIN: ${new Date().toUTCString()}`, 100);
            await addLine(`--- END OF FILE ---`, 500);

            setPhase('done');
            
            // Auto close after 4 seconds
            setTimeout(() => {
                if (mounted) onClose();
            }, 4000);
        };

        sequence();

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);

        return () => {
            mounted = false;
            window.removeEventListener('keydown', handleEscape);
        };
    }, [target, onClose]);

    const renderProgressBar = () => {
        const totalBlocks = 20;
        const filledBlocks = Math.floor((progress / 100) * totalBlocks);
        const emptyBlocks = totalBlocks - filledBlocks;
        return `[${'█'.repeat(filledBlocks)}${'░'.repeat(emptyBlocks)}] ${progress}%`;
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center font-mono backdrop-blur-md p-4">
            <div className="w-full max-w-2xl bg-black border border-red-900/50 rounded-lg shadow-[0_0_30px_rgba(220,38,38,0.15)] overflow-hidden">
                <div className="bg-red-900/20 px-4 py-2 border-b border-red-900/50 flex items-center justify-between">
                    <span className="text-red-500 font-bold text-sm tracking-widest">root@sincity:~# _</span>
                    <button onClick={onClose} className="text-red-500 hover:text-red-400">X</button>
                </div>
                
                <div className="p-6 h-[400px] overflow-y-auto flex flex-col gap-2">
                    {lines.map((line, i) => (
                        <div key={i} className={`text-sm ${line.includes('SUCCESS') || line.includes('DOSSIER') ? 'text-green-500 font-bold' : 'text-red-400'}`}>
                            {line}
                        </div>
                    ))}
                    
                    {phase === 'hacking' && (
                        <div className="text-red-500 font-bold mt-4 animate-pulse">
                            {renderProgressBar()}
                        </div>
                    )}

                    {phase === 'done' && (
                        <div className="mt-8 text-gray-500 text-xs text-center animate-pulse">
                            Connection Terminated. Closing in 4s... [Press ESC to abort]
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
