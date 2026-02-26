import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

/**
 * Hook that captures IP/network data for logged-in users
 * Calls /api/guest-init to get IP info, then stores it in the profiles table
 */
export function useUserIPCapture() {
    const { user } = useAuth();
    const hasCaptured = useRef(false);

    useEffect(() => {
        // Only capture once per session for logged-in users
        if (!user?.id || hasCaptured.current) return;

        const captureIP = async () => {
            try {
                // Check if we already captured IP recently (within last hour)
                const lastCapture = sessionStorage.getItem(`ip_captured_${user.id}`);
                if (lastCapture) {
                    const lastTime = parseInt(lastCapture, 10);
                    if (Date.now() - lastTime < 60 * 60 * 1000) { // 1 hour
                        hasCaptured.current = true;
                        return;
                    }
                }

                // Fetch network info from API
                const baseUrl = `${window.location.protocol}//${window.location.host}`;
                const response = await fetch(`${baseUrl}/api/guest-init`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    console.warn('Failed to fetch IP info for user');
                    return;
                }

                const networkData = await response.json();

                // Update the user's profile with IP data
                const { error } = await supabase
                    .from('profiles')
                    .update({
                        ip_hash: networkData.ip_hash || null,
                        ip_encrypted: networkData.ip_encrypted || null,
                        ip_source: networkData.ip_source || null,
                        country: networkData.country || null,
                        city: networkData.city || null,
                        isp: networkData.isp || null,
                        vpn_detected: networkData.vpn_detected || false,
                        tor_detected: networkData.tor_detected || false,
                        last_ip_update: new Date().toISOString()
                    })
                    .eq('id', user.id);

                if (error) {
                    console.warn('Failed to save IP data:', error.message);
                } else {
                    console.log('User IP captured:', networkData.country, networkData.city, 'source:', networkData.ip_source);
                    sessionStorage.setItem(`ip_captured_${user.id}`, Date.now().toString());

                    // === SECURE IP LOGGING (Server-Side) ===
                    // Call RPC to capture Real IP safely in ip_security_logs
                    const { error: secureError } = await supabase.rpc('log_user_security', {
                        p_ip_hash: networkData.ip_hash || null,
                        p_ip_encrypted: networkData.ip_encrypted || null,
                        p_ip_source: networkData.ip_source || null,
                        p_country: networkData.country || null,
                        p_city: networkData.city || null,
                        p_isp: networkData.isp || null,
                        p_vpn_detected: networkData.vpn_detected || false,
                        p_tor_detected: networkData.tor_detected || false
                    });

                    if (secureError) {
                        console.warn('[useUserIPCapture] Secure logging error:', secureError.message);
                    } else {
                        console.log('[useUserIPCapture] Secure IP log recorded');
                    }
                }

                hasCaptured.current = true;
            } catch (err) {
                console.warn('IP capture error:', err);
            }
        };

        captureIP();
    }, [user?.id]);
}

export default useUserIPCapture;
