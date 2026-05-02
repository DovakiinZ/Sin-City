import { useLanyard } from '@/hooks/useLanyard';
import { Music, Gamepad2 } from 'lucide-react';

interface NowPlayingStatusProps {
    discordId?: string | null;
    officialSpotify?: any | null;
    showAvatar?: boolean;
    compact?: boolean;
}

export default function NowPlayingStatus({ discordId, officialSpotify, showAvatar = false, compact = true }: NowPlayingStatusProps) {
    const { data } = useLanyard(discordId);

    // Prioritize Official Spotify, then Lanyard Spotify, then Lanyard games
    const spotify = officialSpotify || (data?.listening_to_spotify ? data.spotify : null);
    
    // Type 0 is "Playing"
    const gameActivity = data?.activities?.find(a => a.type === 0);

    if (!spotify && !gameActivity) return null;

    if (compact) {
        return (
            <div className="flex items-center gap-1.5 text-xs bg-black/40 border border-green-900/30 px-2 py-0.5 rounded-full overflow-hidden shrink-0 max-w-[150px] sm:max-w-[200px]" title={spotify ? `Listening to: ${spotify.song} by ${spotify.artist}` : `Playing: ${gameActivity?.name}`}>
                {spotify ? (
                    <>
                        <Music className="w-3 h-3 text-green-400 animate-pulse shrink-0" />
                        <span className="text-green-500/80 truncate font-mono">
                            {spotify.song}
                        </span>
                    </>
                ) : (
                    <>
                        <Gamepad2 className="w-3 h-3 text-blue-400 animate-pulse shrink-0" />
                        <span className="text-blue-400/80 truncate font-mono">
                            {gameActivity?.name}
                        </span>
                    </>
                )}
            </div>
        );
    }

    // Detailed version for Profile page
    return (
        <div className="flex flex-col gap-2 font-mono mt-4">
            {spotify && (
                <div className="flex items-center gap-3 bg-black/60 border border-green-900/50 p-3 rounded-lg">
                    {showAvatar && spotify.album_art_url ? (
                        <img src={spotify.album_art_url} alt="Album Art" className="w-12 h-12 rounded border border-green-900/50 object-cover" />
                    ) : (
                        <div className="w-12 h-12 flex items-center justify-center bg-green-900/20 rounded border border-green-900/50">
                            <Music className="w-6 h-6 text-green-500 animate-pulse" />
                        </div>
                    )}
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-xs text-green-500/70 uppercase tracking-widest">Listening to Spotify</span>
                        <span className="text-green-400 font-bold truncate">{spotify.song}</span>
                        <span className="text-gray-500 text-xs truncate">by {spotify.artist}</span>
                    </div>
                </div>
            )}
            
            {gameActivity && (
                <div className="flex items-center gap-3 bg-black/60 border border-blue-900/50 p-3 rounded-lg">
                    <div className="w-12 h-12 flex items-center justify-center bg-blue-900/20 rounded border border-blue-900/50 shrink-0">
                        <Gamepad2 className="w-6 h-6 text-blue-500 animate-pulse" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-xs text-blue-500/70 uppercase tracking-widest">Playing a Game</span>
                        <span className="text-blue-400 font-bold truncate">{gameActivity.name}</span>
                        {gameActivity.details && <span className="text-gray-500 text-xs truncate">{gameActivity.details}</span>}
                        {gameActivity.state && <span className="text-gray-500 text-xs truncate">{gameActivity.state}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}
