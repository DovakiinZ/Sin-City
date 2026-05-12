import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getValidAccessToken } from '@/lib/spotify';
import { useAuth } from '@/context/AuthContext';

export function useSpotifyPresence() {
    const { user } = useAuth();
    const lastTrackIdRef = useRef<string | null>(null);

    useEffect(() => {
        // Only run polling if user is logged in
        if (!user) return;

        let mounted = true;
        let timeoutId: NodeJS.Timeout;

        const pollSpotify = async () => {
            try {
                const token = await getValidAccessToken();
                if (!token) {
                    // Not connected or expired
                    return;
                }

                const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (res.status === 204) {
                    // Not playing anything
                    if (lastTrackIdRef.current !== null) {
                        lastTrackIdRef.current = null;
                        await updateSupabaseStatus(null);
                    }
                } else if (res.ok) {
                    const data = await res.json();
                    if (data && data.is_playing && data.item) {
                        const trackId = data.item.id;
                        if (trackId !== lastTrackIdRef.current) {
                            lastTrackIdRef.current = trackId;
                            
                            const status = {
                                song: data.item.name,
                                artist: data.item.artists.map((a: any) => a.name).join(', '),
                                album_art_url: data.item.album?.images?.[0]?.url || '',
                                track_id: trackId,
                                is_playing: true
                            };
                            await updateSupabaseStatus(status);
                        }
                    } else if (lastTrackIdRef.current !== null) {
                        // Paused or stopped
                        lastTrackIdRef.current = null;
                        await updateSupabaseStatus(null);
                    }
                }
            } catch (err) {
                console.error("Error polling Spotify:", err);
            } finally {
                if (mounted) {
                    // Poll every 30 seconds (reduced from 15s for performance)\n                    timeoutId = setTimeout(pollSpotify, 30000);
                }
            }
        };

        const updateSupabaseStatus = async (status: any) => {
            try {
                await supabase
                    .from('profiles')
                    .update({ spotify_status: status })
                    .eq('id', user.id);
            } catch (e) {
                console.error("Failed to update spotify status in db", e);
            }
        };

        // Initial poll
        pollSpotify();

        return () => {
            mounted = false;
            if (timeoutId) clearTimeout(timeoutId);
            
            // Optional: clear status when leaving app entirely, but let's leave it 
            // so it persists if they just refresh.
        };
    }, [user]);
}
