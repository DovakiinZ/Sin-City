import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_INTERVAL = 60000; // 60 seconds

export function usePresence() {
    const { user } = useAuth();
    const lastUpdate = useRef<number>(Date.now());
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!user) return;

        // Function to push update to DB
        const updatePresence = async () => {
            const now = Date.now();
            // Throttle: Only update if enough time passed
            if (now - lastUpdate.current < HEARTBEAT_INTERVAL) return;

            lastUpdate.current = now;
            try {
                await supabase.rpc('update_last_seen');
            } catch (err) {
                console.error('Failed to update presence:', err);
            }
        };

        // Initial update on mount
        updatePresence();

        // Event listeners to detect "active" usage
        const handleActivity = () => {
            // If user is active, and enough time passed, update DB
            // We assume usage = active.
            // But we don't want to spam RPC on every mouse move.
            // We use the same throttle logic.
            updatePresence();
        };

        // Add listeners
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('click', handleActivity);
        window.addEventListener('scroll', handleActivity);
        window.addEventListener('focus', handleActivity);

        // Also minimal heartbeat just in case they are reading (not moving mouse)
        timeoutRef.current = setInterval(updatePresence, HEARTBEAT_INTERVAL);

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('scroll', handleActivity);
            window.removeEventListener('focus', handleActivity);
            if (timeoutRef.current) clearInterval(timeoutRef.current);
        };
    }, [user]);
}
