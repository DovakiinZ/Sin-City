import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

/**
 * IDENTITY SYSTEM
 * 
 * Core Rule: Every request resolves to exactly ONE identity
 * - If authenticated → user_id
 * - If not authenticated → anon_id (guest_id)
 * - NEVER both, NEVER none
 * 
 * On revisit without token but matching fingerprint/IP → assign existing guest_id
 */

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

interface Identity {
    type: 'user' | 'anon';
    id: string;

    // User-specific (only when type === 'user')
    username?: string;
    email?: string;
    role?: string;

    // Anon-specific (only when type === 'anon')
    anon_id?: string;       // ANON-XXXXXX format
    anon_token?: string;    // Persistent token for storage
    trust_score?: number;
    post_count?: number;
    email_verified?: boolean;
    status?: 'active' | 'blocked' | 'restricted' | 'merged';
    is_new?: boolean;
    match_type?: 'token' | 'fingerprint' | 'soft_link' | 'created';
}

interface IdentityState {
    identity: Identity | null;
    isLoading: boolean;
    error: string | null;
    isResolved: boolean;
}

interface IdentityResult extends IdentityState {
    refreshIdentity: () => Promise<void>;
    getActorInfo: () => { actor_type: 'user' | 'anon'; actor_id: string } | null;
}

// Storage keys
const ANON_TOKEN_KEY = 'sin_city_anon_token';
const FINGERPRINT_KEY = 'sin_city_fingerprint';
const SESSION_KEY = 'sin_city_session';

// Generate browser fingerprint (client-side)
function generateFingerprint(): { fingerprint: string; deviceInfo: DeviceInfo } {
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

    // Create fingerprint from device characteristics
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

    // Simple hash
    let hash = 0;
    for (let i = 0; i < fingerprintData.length; i++) {
        const char = fingerprintData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const fingerprint = Math.abs(hash).toString(16).padStart(8, '0');

    return { fingerprint, deviceInfo };
}

function getCanvasFingerprint(): string {
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
        ctx.fillText('Sin City', 2, 15);

        let hash = 0;
        const data = canvas.toDataURL();
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    } catch {
        return 'canvas-error';
    }
}

function getSessionId(): string {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
        sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
}

export function useIdentity(): IdentityResult {
    const { user } = useAuth();
    const [state, setState] = useState<IdentityState>({
        identity: null,
        isLoading: true,
        error: null,
        isResolved: false,
    });

    const initializingRef = useRef(false);

    // Resolve identity
    const resolveIdentity = useCallback(async () => {
        // Prevent double initialization
        if (initializingRef.current) return;
        initializingRef.current = true;

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // ================================================================
            // CASE 1: Authenticated user → user identity
            // ================================================================
            if (user) {
                const identity: Identity = {
                    type: 'user',
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: undefined, // role not available in auth context user
                };

                setState({
                    identity,
                    isLoading: false,
                    error: null,
                    isResolved: true,
                });

                // Check if we should merge any anon identity
                const anonToken = localStorage.getItem(ANON_TOKEN_KEY);
                const fingerprint = localStorage.getItem(FINGERPRINT_KEY);

                if (anonToken || fingerprint) {
                    try {
                        const { data: mergeResult } = await supabase.rpc('auto_merge_on_registration', {
                            p_user_id: user.id,
                            p_anon_token: anonToken,
                            p_fingerprint: fingerprint,
                        });

                        if (mergeResult?.success && mergeResult?.merged !== false) {
                            console.log('[Identity] Merged anon identity:', mergeResult);
                            // Clear anon token after merge
                            localStorage.removeItem(ANON_TOKEN_KEY);
                        }
                    } catch (mergeError) {
                        console.warn('[Identity] Merge check failed:', mergeError);
                    }
                }

                initializingRef.current = false;
                return;
            }

            // ================================================================
            // CASE 2: Not authenticated → anon identity
            // ================================================================

            // Get stored anon token
            const storedToken = localStorage.getItem(ANON_TOKEN_KEY);

            // Check for legacy guest ID (for migration)
            // Legacy key format was `guest_id_${fingerprint}`
            const tempFingerprint = generateFingerprint().fingerprint;
            const legacyGuestId = !storedToken ? localStorage.getItem(`guest_id_${tempFingerprint}`) : null;

            // Generate fingerprint
            const { fingerprint, deviceInfo } = generateFingerprint();
            localStorage.setItem(FINGERPRINT_KEY, fingerprint);

            const sessionId = getSessionId();

            // Call identity-init API to get server-side data
            let serverData = null;
            try {
                const baseUrl = `${window.location.protocol}//${window.location.host}`;
                const response = await fetch(`${baseUrl}/api/identity-init`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        anon_token: storedToken,
                        fingerprint,
                        session_id: sessionId,

                        device_info: deviceInfo,
                        legacy_guest_id: legacyGuestId, // Send legacy ID to API
                    }),
                });

                if (response.ok) {
                    serverData = await response.json();
                }
            } catch (apiError) {
                console.warn('[Identity] API call failed, using RPC only:', apiError);
            }

            // Call resolve_anon_identity RPC
            const { data: identityResult, error: rpcError } = await supabase.rpc('resolve_anon_identity', {
                p_anon_token: storedToken,
                p_fingerprint: fingerprint,
                p_session_id: sessionId,
                p_device_info: deviceInfo,
                p_ip_address: serverData?._identity_params?.p_ip_address || null,
                p_ip_hash: serverData?._identity_params?.p_ip_hash || null,
                p_country: serverData?.country || null,
                p_city: serverData?.city || null,
                p_isp: serverData?._identity_params?.p_isp || null,
                p_vpn_detected: serverData?._identity_params?.p_vpn_detected || false,
                p_tor_detected: serverData?._identity_params?.p_tor_detected || false,
                p_legacy_guest_id: legacyGuestId, // Send legacy ID to RPC
            });

            if (rpcError) {
                throw new Error(rpcError.message);
            }

            if (!identityResult?.success) {
                throw new Error(identityResult?.error || 'Identity resolution failed');
            }

            // Store the anon token for future visits
            if (identityResult.anon_token) {
                localStorage.setItem(ANON_TOKEN_KEY, identityResult.anon_token);
            }

            const identity: Identity = {
                type: 'anon',
                id: identityResult.guest_id,
                anon_id: identityResult.anon_id,
                anon_token: identityResult.anon_token,
                trust_score: identityResult.trust_score,
                post_count: identityResult.post_count,
                email_verified: identityResult.email_verified,
                status: identityResult.status,
                is_new: identityResult.is_new,
                match_type: identityResult.match_type,
            };

            setState({
                identity,
                isLoading: false,
                error: null,
                isResolved: true,
            });

            console.log('[Identity] Resolved:', {
                type: identity.type,
                id: identity.id,
                anonId: identity.anon_id,
                isNew: identity.is_new,
                matchType: identity.match_type,
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Identity] Resolution failed:', error);
            setState({
                identity: null,
                isLoading: false,
                error: message,
                isResolved: false,
            });
        } finally {
            initializingRef.current = false;
        }
    }, [user]);

    // Initialize on mount and when auth changes
    useEffect(() => {
        resolveIdentity();
    }, [resolveIdentity]);

    // Helper to get actor info for content creation
    const getActorInfo = useCallback(() => {
        if (!state.identity) return null;

        return {
            actor_type: state.identity.type as 'user' | 'anon',
            actor_id: state.identity.id,
        };
    }, [state.identity]);

    return {
        ...state,
        refreshIdentity: resolveIdentity,
        getActorInfo,
    };
}

/**
 * Hook to get current actor for content creation
 * Returns { user_id, guest_id } where exactly one is set
 */
export function useContentAuthor() {
    const { identity, isResolved } = useIdentity();

    if (!isResolved || !identity) {
        return { user_id: null, guest_id: null, isReady: false };
    }

    if (identity.type === 'user') {
        return { user_id: identity.id, guest_id: null, isReady: true };
    }

    return { user_id: null, guest_id: identity.id, isReady: true };
}

export default useIdentity;
