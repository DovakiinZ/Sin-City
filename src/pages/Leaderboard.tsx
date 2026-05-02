import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Trophy, Gamepad2, Medal } from 'lucide-react';
import { UserAvatarWithStatus } from '@/components/UserAvatarWithStatus';
import { Link } from 'react-router-dom';

type Score = {
    id: string;
    user_id: string;
    game_name: string;
    score: number;
    created_at: string;
    profiles: {
        username: string;
        avatar_url: string;
        display_name: string;
    };
};

export default function Leaderboard() {
    const [scores, setScores] = useState<Score[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedGame, setSelectedGame] = useState<'snake' | 'tetris' | 'pacman'>('snake');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchScores();
    }, [selectedGame]);

    const fetchScores = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('game_scores')
                .select(`
                    id, 
                    user_id, 
                    game_name, 
                    score, 
                    created_at,
                    profiles (username, avatar_url, display_name)
                `)
                .eq('game_name', selectedGame)
                .order('score', { ascending: false })
                .limit(50);

            if (error) {
                // Ignore if table doesn't exist yet
                if (error.code !== '42P01') {
                    throw error;
                }
            } else if (data) {
                // Deduplicate by user_id to only show highest score per user
                const uniqueUsers = new Map();
                for (const row of data as unknown as Score[]) {
                    if (!uniqueUsers.has(row.user_id) || uniqueUsers.get(row.user_id).score < row.score) {
                        uniqueUsers.set(row.user_id, row);
                    }
                }
                const sortedUnique = Array.from(uniqueUsers.values()).sort((a, b) => b.score - a.score);
                setScores(sortedUnique);
            }
        } catch (err: any) {
            console.error("Error fetching scores:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-green-900/50">
                <Trophy className="w-8 h-8 text-yellow-500" />
                <h1 className="text-3xl font-bold text-green-500 tracking-widest uppercase">Leaderboard</h1>
            </div>

            <div className="flex gap-2 mb-8 border-b border-green-900/30 pb-2 overflow-x-auto">
                <button
                    onClick={() => setSelectedGame('snake')}
                    className={`px-4 py-2 font-mono font-bold uppercase transition-colors whitespace-nowrap ${
                        selectedGame === 'snake' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500 hover:text-green-500/50'
                    }`}
                >
                    Snake
                </button>
                <button
                    onClick={() => setSelectedGame('tetris')}
                    className={`px-4 py-2 font-mono font-bold uppercase transition-colors whitespace-nowrap ${
                        selectedGame === 'tetris' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-blue-500/50'
                    }`}
                >
                    Tetris
                </button>
                <button
                    onClick={() => setSelectedGame('pacman')}
                    className={`px-4 py-2 font-mono font-bold uppercase transition-colors whitespace-nowrap ${
                        selectedGame === 'pacman' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500 hover:text-yellow-500/50'
                    }`}
                >
                    Pacman
                </button>
            </div>

            {loading ? (
                <div className="text-center text-green-900/50 py-10 font-mono animate-pulse">
                    Loading scores...
                </div>
            ) : error ? (
                <div className="text-center text-red-500 py-10 font-mono">
                    <p>Database table not found. Please run the SQL migration.</p>
                </div>
            ) : scores.length === 0 ? (
                <div className="text-center text-gray-500 py-10 font-mono flex flex-col items-center">
                    <Gamepad2 className="w-12 h-12 text-gray-700 mb-4" />
                    <p>No high scores yet for {selectedGame.toUpperCase()}.</p>
                    <p className="text-xs mt-2 text-green-900/80">Type `/play ${selectedGame}` in the terminal to set the first record!</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {scores.map((score, index) => {
                        let RankIcon = null;
                        if (index === 0) RankIcon = <Medal className="w-6 h-6 text-yellow-400" />;
                        else if (index === 1) RankIcon = <Medal className="w-6 h-6 text-gray-300" />;
                        else if (index === 2) RankIcon = <Medal className="w-6 h-6 text-amber-700" />;

                        return (
                            <div key={score.id} className="flex items-center justify-between p-4 bg-black border border-green-900/30 rounded-lg group hover:border-green-500/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 text-center font-mono font-bold text-xl text-gray-500 flex justify-center">
                                        {RankIcon || <span className="text-sm">#{index + 1}</span>}
                                    </div>
                                    <Link to={`/user/${score.profiles?.username}`} className="flex items-center gap-3">
                                        <UserAvatarWithStatus
                                            profile={{
                                                avatar_url: score.profiles?.avatar_url,
                                                display_name: score.profiles?.display_name,
                                                username: score.profiles?.username,
                                            }}
                                            className="w-10 h-10 border border-green-900/50"
                                        />
                                        <div className="font-mono">
                                            <div className="text-green-400 font-bold">@{score.profiles?.username || 'unknown'}</div>
                                            <div className="text-xs text-gray-600">{new Date(score.created_at).toLocaleDateString()}</div>
                                        </div>
                                    </Link>
                                </div>
                                <div className={`font-mono text-2xl font-bold tracking-widest ${
                                    selectedGame === 'snake' ? 'text-green-500' :
                                    selectedGame === 'tetris' ? 'text-blue-500' : 'text-yellow-500'
                                }`}>
                                    {score.score.toLocaleString()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
