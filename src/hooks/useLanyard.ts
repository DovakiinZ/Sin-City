import { useState, useEffect } from 'react';

export type LanyardData = {
    spotify: {
        track_id: string;
        song: string;
        artist: string;
        album_art_url: string;
        album: string;
    } | null;
    listening_to_spotify: boolean;
    discord_status: string;
    activities: {
        type: number;
        name: string;
        details?: string;
        state?: string;
        assets?: {
            large_image?: string;
            small_image?: string;
        };
    }[];
};

export function useLanyard(discordId?: string | null) {
    const [data, setData] = useState<LanyardData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!discordId) {
            setData(null);
            return;
        }

        let mounted = true;
        let timeoutId: NodeJS.Timeout;

        const fetchPresence = async () => {
            try {
                // setLoading(true); // Don't show loading on background polls
                const res = await fetch(`https://api.lanyard.rest/v1/users/${discordId}`);
                if (!res.ok) throw new Error('User not found or not in Lanyard Discord');
                
                const json = await res.json();
                if (mounted && json.success) {
                    setData(json.data);
                    setError(null);
                } else if (mounted) {
                    throw new Error('Lanyard error');
                }
            } catch (err: any) {
                if (mounted) setError(err);
            } finally {
                if (mounted) {
                    setLoading(false);
                    // Poll every 15 seconds
                    timeoutId = setTimeout(fetchPresence, 15000);
                }
            }
        };

        setLoading(true);
        fetchPresence();

        return () => {
            mounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [discordId]);

    return { data, loading, error };
}
