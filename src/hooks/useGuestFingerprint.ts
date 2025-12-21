import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface DeviceInfo {
    userAgent: string;
    screen: string;
    timezone: string;
    language: string;
    platform: string;
    colorDepth: number;
    touchSupport: boolean;
    deviceMemory: number | null;
    hardwareConcurrency: number | null;
}

interface GuestData {
    id: string;
    status: 'active' | 'blocked' | 'restricted';
    post_count: number;
    email: string | null;
    email_verified: boolean;
    trust_score: number;
}

interface GuestFingerprintResult {
    fingerprint: string;
    deviceInfo: DeviceInfo;
    guestId: string | null;
    guestData: GuestData | null;
    isLoading: boolean;
    error: string | null;
    isBlocked: boolean;
    postCount: number;
    requiresEmail: boolean;
    refreshGuestData: () => Promise<void>;
    createOrUpdateGuest: (email?: string) => Promise<{
        guestId: string | null;
        status: string | null;
        postCount: number;
        requiresEmail: boolean;
    }>;
}

// Simple hash function for fingerprint generation (synchronous)
const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
};

// Generate enhanced fingerprint with all browser characteristics
const generateFingerprint = (): { fingerprint: string; deviceInfo: DeviceInfo } => {
    const deviceMemory = (navigator as any).deviceMemory || null;
    const hardwareConcurrency = navigator.hardwareConcurrency || null;

    const deviceInfo: DeviceInfo = {
        userAgent: navigator.userAgent,
        screen: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform || 'unknown',
        colorDepth: window.screen.colorDepth,
        touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        deviceMemory,
        hardwareConcurrency,
    };

    // Create fingerprint from all device characteristics
    const fingerprintData = [
        deviceInfo.userAgent,
        deviceInfo.screen,
        deviceInfo.timezone,
        deviceInfo.language,
        deviceInfo.platform,
        deviceInfo.colorDepth.toString(),
        deviceInfo.touchSupport.toString(),
        deviceInfo.deviceMemory?.toString() || 'unknown',
        deviceInfo.hardwareConcurrency?.toString() || 'unknown',
        getCanvasFingerprint(),
    ].join('|');

    const fingerprint = simpleHash(fingerprintData);
    return { fingerprint, deviceInfo };
};

// Canvas fingerprint for additional uniqueness
const getCanvasFingerprint = (): string => {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas';

        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('Sin City Guest', 2, 15);

        return simpleHash(canvas.toDataURL());
    } catch {
        return 'canvas-error';
    }
};

// Generate a session ID for this browser session
const generateSessionId = (): string => {
    const stored = sessionStorage.getItem('guest_session_id');
    if (stored) return stored;

    const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('guest_session_id', sessionId);
    return sessionId;
};

export function useGuestFingerprint(): GuestFingerprintResult {
    const [fingerprint, setFingerprint] = useState<string>('');
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
        userAgent: '',
        screen: '',
        timezone: '',
        language: '',
        platform: '',
        colorDepth: 0,
        touchSupport: false,
        deviceMemory: null,
        hardwareConcurrency: null,
    });
    const [guestId, setGuestId] = useState<string | null>(null);
    const [guestData, setGuestData] = useState<GuestData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Generate fingerprint on mount
    useEffect(() => {
        const init = async () => {
            try {
                const { fingerprint: fp, deviceInfo: di } = generateFingerprint();
                setFingerprint(fp);
                setDeviceInfo(di);

                // Check if we have a cached guest ID for this fingerprint
                const cachedGuestId = localStorage.getItem(`guest_id_${fp}`);
                if (cachedGuestId) {
                    setGuestId(cachedGuestId);
                    // Try to fetch current guest data
                    const { data } = await supabase
                        .from('guests')
                        .select('id, status, post_count, email, trust_score')
                        .eq('id', cachedGuestId)
                        .maybeSingle();  // Use maybeSingle to avoid error if not found
                    if (data) {
                        setGuestData(data as GuestData);
                    }
                }
            } catch (err) {
                console.error('Fingerprint generation error:', err);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, []);

    // Create or update guest record in database - simplified version
    const createOrUpdateGuest = useCallback(async (
        email?: string
    ): Promise<{ guestId: string | null; status: string | null; postCount: number; requiresEmail: boolean }> => {
        if (!fingerprint) {
            setError('Fingerprint not ready');
            return { guestId: null, status: null, postCount: 0, requiresEmail: false };
        }

        setIsLoading(true);
        setError(null);

        try {
            const sessionId = generateSessionId();

            // First, try to find existing guest
            let existingGuest = null;
            const { data: foundGuest } = await supabase
                .from('guests')
                .select('id, status, post_count, email, trust_score')
                .eq('fingerprint', fingerprint)
                .maybeSingle();

            existingGuest = foundGuest;

            let newGuestId: string;
            let currentPostCount: number;

            if (!existingGuest) {
                // Create new guest directly (bypass RPC if it's failing)
                const { data: insertedGuest, error: insertError } = await supabase
                    .from('guests')
                    .insert({
                        fingerprint,
                        session_id: sessionId,
                        email: email || null,
                        device_info: deviceInfo,
                        flags: ['new'],
                        post_count: 0,
                        status: 'active',
                        trust_score: 50
                    })
                    .select('id, status, post_count, email, trust_score')
                    .single();

                if (insertError) {
                    console.error('Error creating guest:', insertError);
                    setError(insertError.message);
                    return { guestId: null, status: null, postCount: 0, requiresEmail: false };
                }

                newGuestId = insertedGuest.id;
                currentPostCount = 0;
                existingGuest = insertedGuest;
            } else {
                // Update existing guest
                newGuestId = existingGuest.id;
                currentPostCount = existingGuest.post_count || 0;

                // Update last seen and optionally email
                const updateData: any = {
                    last_seen_at: new Date().toISOString(),
                    session_id: sessionId
                };
                if (email) {
                    updateData.email = email;
                }

                await supabase
                    .from('guests')
                    .update(updateData)
                    .eq('id', newGuestId);
            }

            setGuestId(newGuestId);
            setGuestData(existingGuest as GuestData);

            // Cache the guest ID locally
            localStorage.setItem(`guest_id_${fingerprint}`, newGuestId);

            // Check if email is required (>= 2 posts and no email)
            const hasEmail = !!(email || existingGuest?.email);
            const requiresEmail = currentPostCount >= 2 && !hasEmail;

            console.log('Guest state:', {
                guestId: newGuestId,
                postCount: currentPostCount,
                hasEmail,
                requiresEmail,
                status: existingGuest?.status
            });

            return {
                guestId: newGuestId,
                status: existingGuest?.status || 'active',
                postCount: currentPostCount,
                requiresEmail,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(message);
            console.error('Guest creation error:', err);
            return { guestId: null, status: null, postCount: 0, requiresEmail: false };
        } finally {
            setIsLoading(false);
        }
    }, [fingerprint, deviceInfo]);

    // Refresh guest data (useful after verification)
    const refreshGuestData = useCallback(async () => {
        if (!guestId) return;
        try {
            const { data } = await supabase
                .from('guests')
                .select('id, status, post_count, email, email_verified, trust_score')
                .eq('id', guestId)
                .maybeSingle();
            if (data) {
                setGuestData(data as GuestData);
            }
        } catch (err) {
            console.error('Error refreshing guest data:', err);
        }
    }, [guestId]);

    const postCount = guestData?.post_count || 0;
    const requiresEmail = postCount >= 2 && !guestData?.email_verified;

    return {
        fingerprint,
        deviceInfo,
        guestId,
        guestData,
        isLoading,
        error,
        isBlocked: guestData?.status === 'blocked',
        postCount,
        requiresEmail,
        refreshGuestData,
        createOrUpdateGuest,
    };
}

export default useGuestFingerprint;
