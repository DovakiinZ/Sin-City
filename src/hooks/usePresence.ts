import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

/**
 * Hook to track user presence via heartbeat
 * Call this in your main App or Layout component
 */
export function usePresence() {
    const { user } = useAuth();
    const lastUpdate = useRef<number>(Date.now());

    const sendHeartbeat = useCallback(async () => {
        if (!user) return;

        const now = Date.now();
        // Throttle: Only update if enough time passed
        if (now - lastUpdate.current < HEARTBEAT_INTERVAL / 2) return;

        lastUpdate.current = now;
        try {
            await supabase.rpc('update_presence');
        } catch (error) {
            // Silently fail - presence is non-critical
            console.debug('Presence heartbeat failed:', error);
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;

        // Send initial heartbeat
        sendHeartbeat();

        // Set up interval
        const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Also send heartbeat on visibility change (when tab becomes active)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                sendHeartbeat();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Activity listeners for more responsive presence
        const handleActivity = () => sendHeartbeat();
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('focus', handleActivity);

        // Cleanup on unmount
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('focus', handleActivity);
        };
    }, [user, sendHeartbeat]);
}

/**
 * Get the presence status of a specific user
 */
export async function getPresenceStatus(userId: string): Promise<{
    status: 'active_now' | 'active_recently' | 'offline';
    lastSeen: string | null;
}> {
    try {
        const { data, error } = await supabase.rpc('get_presence_status', {
            user_uuid: userId
        });
        if (error || !data || data.length === 0) {
            return { status: 'offline', lastSeen: null };
        }
        return {
            status: data[0].status as 'active_now' | 'active_recently' | 'offline',
            lastSeen: data[0].last_seen
        };
    } catch {
        return { status: 'offline', lastSeen: null };
    }
}

/**
 * Format presence status for display
 */
export function formatPresence(status: string, lastSeen: string | null): string {
    if (status === 'active_now') return 'Active now';
    if (status === 'active_recently' && lastSeen) {
        const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000);
        if (mins < 1) return 'Active now';
        if (mins === 1) return 'Active 1m ago';
        return `Active ${mins}m ago`;
    }
    return 'Offline';
}

/**
 * Hook to get and track a specific user's presence
 */
export function useUserPresence(userId: string | undefined) {
    const [presence, setPresence] = useState<{
        status: 'active_now' | 'active_recently' | 'offline';
        lastSeen: string | null;
        formatted: string;
    }>({ status: 'offline', lastSeen: null, formatted: 'Offline' });

    useEffect(() => {
        if (!userId) return;

        const fetchPresence = async () => {
            const result = await getPresenceStatus(userId);
            setPresence({
                ...result,
                formatted: formatPresence(result.status, result.lastSeen)
            });
        };

        fetchPresence();

        // Refresh every 30 seconds
        const interval = setInterval(fetchPresence, 30000);

        return () => clearInterval(interval);
    }, [userId]);

    return presence;
}
