import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFirstTouch, getAudioFingerprint, getFontFingerprint, computeGeoMismatch, type FirstTouch } from '@/lib/tracking';

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
    // Extended signals (optional) — richer entropy + parsed device details
    availableScreen?: string;
    pixelRatio?: number;
    languages?: string;
    maxTouchPoints?: number;
    webglVendor?: string;
    webglRenderer?: string;
    connectionType?: string;
    effectiveType?: string;
    downlink?: number | null;
    rtt?: number | null;
    prefersColorScheme?: string;
    referrer?: string;
    browser?: string;
    browserVersion?: string;
    os?: string;
    osVersion?: string;
    deviceType?: string;
    fonts?: string;
    audioHash?: string;
}

interface GuestData {
    id: string;
    anonymous_id: string | null;
    status: 'active' | 'blocked' | 'restricted';
    post_count: number;
    email: string | null;
    email_verified: boolean;
    trust_score: number;
}

interface NetworkInfo {
    ip_hash: string;
    ip_encrypted?: string;  // AES-256 encrypted raw IP
    ip_source?: string;     // Header source: cf, xff, real, socket
    country: string;
    city: string;
    isp: string;
    vpn_detected: boolean;
    tor_detected: boolean;
    // Rich network profile (dual-provider lookup)
    proxy_detected?: boolean;
    hosting_detected?: boolean;
    mobile_detected?: boolean;
    network_info?: Record<string, unknown>;
}

// Fetch network info from server (IP capture)
const fetchNetworkInfo = async (): Promise<NetworkInfo | null> => {
    try {
        // Use production API endpoint
        const baseUrl = typeof window !== 'undefined'
            ? `${window.location.protocol}//${window.location.host}`
            : '';

        const response = await fetch(`${baseUrl}/api/guest-init`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            console.warn('Failed to fetch network info:', response.status);
            return null;
        }

        const data = await response.json();
        return {
            ip_hash: data.ip_hash || null,
            ip_encrypted: data.ip_encrypted || null,
            ip_source: data.ip_source || null,
            country: data.country || null,
            city: data.city || null,
            isp: data.isp || null,
            vpn_detected: data.vpn_detected || false,
            tor_detected: data.tor_detected || false,
            proxy_detected: data.proxy_detected || false,
            hosting_detected: data.hosting_detected || false,
            mobile_detected: data.mobile_detected || false,
            network_info: data.network_info || {}
        };
    } catch (error) {
        console.warn('Network info fetch error:', error);
        return null;
    }
};

// Email intelligence: disposable / MX validity / gravatar (server-side)
interface EmailIntel {
    valid: boolean;
    disposable: boolean;
    mx_valid: boolean;
    gravatar_hash: string | null;
    has_gravatar: boolean;
    name: string | null;
}
const fetchEmailIntel = async (email: string): Promise<EmailIntel | null> => {
    try {
        const baseUrl = typeof window !== 'undefined'
            ? `${window.location.protocol}//${window.location.host}`
            : '';
        const res = await fetch(`${baseUrl}/api/email-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
};

interface GuestFingerprintResult {
    fingerprint: string;
    deviceInfo: DeviceInfo;
    guestId: string | null;
    anonymousId: string | null;
    guestData: GuestData | null;
    isLoading: boolean;
    error: string | null;
    isBlocked: boolean;
    postCount: number;
    requiresEmail: boolean;
    refreshGuestData: () => Promise<void>;
    createOrUpdateGuest: (email?: string) => Promise<{
        guestId: string | null;
        anonymousId: string | null;
        status: string | null;
        postCount: number;
        requiresEmail: boolean;
    }>;
}

// Simple hash function — kept for legacy fingerprint continuity (32-bit, weak)
const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
};

// cyrb53 — high-quality 53-bit hash; avoids the collisions of the old 32-bit hash
const cyrb53 = (str: string, seed = 0): string => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
};

// GPU fingerprint via WebGL — one of the strongest stable device signals
const getWebGLFingerprint = (): { vendor: string; renderer: string } => {
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return { vendor: '', renderer: '' };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '') : String(gl.getParameter(gl.VENDOR) || '');
        const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || '');
        return { vendor, renderer };
    } catch {
        return { vendor: '', renderer: '' };
    }
};

// Network Information API (connection type / speed) — Chromium only, best-effort
const getConnectionInfo = () => {
    const c = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!c) return { connectionType: '', effectiveType: '', downlink: null as number | null, rtt: null as number | null };
    return {
        connectionType: c.type || '',
        effectiveType: c.effectiveType || '',
        downlink: typeof c.downlink === 'number' ? c.downlink : null,
        rtt: typeof c.rtt === 'number' ? c.rtt : null,
    };
};

// Lightweight, dependency-free User-Agent parser → browser / OS / device type
const parseUA = (ua: string) => {
    const u = ua || '';
    const grab = (re: RegExp) => { const x = u.match(re); return x ? x[1] : ''; };
    let browser = 'Unknown', browserVersion = '';
    if (/Edg\//.test(u)) { browser = 'Edge'; browserVersion = grab(/Edg\/([\d.]+)/); }
    else if (/OPR\/|Opera/.test(u)) { browser = 'Opera'; browserVersion = grab(/(?:OPR|Opera)\/([\d.]+)/); }
    else if (/Firefox\//.test(u)) { browser = 'Firefox'; browserVersion = grab(/Firefox\/([\d.]+)/); }
    else if (/Chrome\//.test(u)) { browser = 'Chrome'; browserVersion = grab(/Chrome\/([\d.]+)/); }
    else if (/Version\/[\d.]+.*Safari/.test(u)) { browser = 'Safari'; browserVersion = grab(/Version\/([\d.]+)/); }
    else if (/Safari\//.test(u)) { browser = 'Safari'; }

    let os = 'Unknown', osVersion = '';
    if (/Windows NT/.test(u)) { os = 'Windows'; const w = grab(/Windows NT ([\d.]+)/); osVersion = ({ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' } as Record<string, string>)[w] || w; }
    else if (/Android/.test(u)) { os = 'Android'; osVersion = grab(/Android ([\d.]+)/); }
    else if (/iPhone|iPad|iPod/.test(u)) { os = 'iOS'; osVersion = (grab(/OS ([\d_]+)/) || '').replace(/_/g, '.'); }
    else if (/Mac OS X/.test(u)) { os = 'macOS'; osVersion = (grab(/Mac OS X ([\d_]+)/) || '').replace(/_/g, '.'); }
    else if (/CrOS/.test(u)) { os = 'ChromeOS'; }
    else if (/Linux/.test(u)) { os = 'Linux'; }

    let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
    if (/iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u))) deviceType = 'tablet';
    else if (/Mobi|iPhone|iPod|Windows Phone/.test(u)) deviceType = 'mobile';

    return { browser, browserVersion, os, osVersion, deviceType };
};

// Generate enhanced fingerprint with all browser characteristics.
// Returns BOTH a strong (cyrb53 + GPU + more entropy) fingerprint used going
// forward, and the legacy 32-bit fingerprint so returning guests still match.
const generateFingerprint = async (): Promise<{ fingerprint: string; fingerprintLegacy: string; deviceInfo: DeviceInfo }> => {
    const deviceMemory = (navigator as any).deviceMemory || null;
    const hardwareConcurrency = navigator.hardwareConcurrency || null;
    const webgl = getWebGLFingerprint();
    const conn = getConnectionInfo();
    const ua = navigator.userAgent;
    const parsed = parseUA(ua);
    const prefersColorScheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    const fonts = getFontFingerprint();
    const audioHash = await getAudioFingerprint();

    const deviceInfo: DeviceInfo = {
        userAgent: ua,
        screen: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
        availableScreen: `${window.screen.availWidth}x${window.screen.availHeight}`,
        pixelRatio: window.devicePixelRatio || 1,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        languages: Array.isArray(navigator.languages) ? navigator.languages.join(',') : '',
        platform: navigator.platform || 'unknown',
        colorDepth: window.screen.colorDepth,
        touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        deviceMemory,
        hardwareConcurrency,
        webglVendor: webgl.vendor,
        webglRenderer: webgl.renderer,
        connectionType: conn.connectionType,
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        prefersColorScheme,
        referrer: document.referrer || '',
        browser: parsed.browser,
        browserVersion: parsed.browserVersion,
        os: parsed.os,
        osVersion: parsed.osVersion,
        deviceType: parsed.deviceType,
        fonts: fonts.join(','),
        audioHash,
    };

    // Legacy fingerprint — EXACT original formula, for backward-compatible matching
    const legacyData = [
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
    const fingerprintLegacy = simpleHash(legacyData);

    // Strong fingerprint — adds GPU, pixel ratio, touch points, color scheme, parsed OS/browser
    const strongData = [
        legacyData,
        deviceInfo.availableScreen,
        String(deviceInfo.pixelRatio),
        String(deviceInfo.maxTouchPoints),
        deviceInfo.webglVendor,
        deviceInfo.webglRenderer,
        deviceInfo.prefersColorScheme,
        deviceInfo.os,
        deviceInfo.browser,
        deviceInfo.fonts || '',
        deviceInfo.audioHash || '',
    ].join('|');
    const fingerprint = cyrb53(strongData);

    return { fingerprint, fingerprintLegacy, deviceInfo };
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
    const [fingerprintLegacy, setFingerprintLegacy] = useState<string>('');
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
    const [firstTouch, setFirstTouch] = useState<FirstTouch | null>(null);

    // Generate fingerprint on mount
    useEffect(() => {
        const init = async () => {
            try {
                setFirstTouch(getFirstTouch());
                const { fingerprint: fp, fingerprintLegacy: fpL, deviceInfo: di } = await generateFingerprint();
                setFingerprint(fp);
                setFingerprintLegacy(fpL);
                setDeviceInfo(di);

                // Check if we have a cached guest ID for this fingerprint (new or legacy key)
                const cachedGuestId = localStorage.getItem(`guest_id_${fp}`) || localStorage.getItem(`guest_id_${fpL}`);
                if (cachedGuestId) {
                    setGuestId(cachedGuestId);
                    // Try to fetch current guest data
                    const { data } = await supabase
                        .from('guests')
                        .select('id, anonymous_id, status, post_count, email, trust_score')
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
    ): Promise<{ guestId: string | null; anonymousId: string | null; status: string | null; postCount: number; requiresEmail: boolean }> => {
        if (!fingerprint) {
            setError('Fingerprint not ready');
            return { guestId: null, anonymousId: null, status: null, postCount: 0, requiresEmail: false };
        }

        setIsLoading(true);
        setError(null);

        try {
            const sessionId = generateSessionId();

            // Find existing guest by the strong fingerprint first, then fall back
            // to the legacy fingerprint so returning visitors aren't orphaned by
            // the algorithm upgrade. On a legacy match, migrate the row forward.
            const GUEST_SELECT = 'id, anonymous_id, status, post_count, email, trust_score';
            let existingGuest = null;
            const { data: foundGuest } = await supabase
                .from('guests')
                .select(GUEST_SELECT)
                .eq('fingerprint', fingerprint)
                .maybeSingle();
            existingGuest = foundGuest;

            if (!existingGuest && fingerprintLegacy) {
                const { data: legacyGuest } = await supabase
                    .from('guests')
                    .select(GUEST_SELECT)
                    .eq('fingerprint', fingerprintLegacy)
                    .maybeSingle();
                if (legacyGuest) {
                    existingGuest = legacyGuest;
                    // Migrate the row to the strong fingerprint, keeping the legacy value
                    await supabase
                        .from('guests')
                        .update({ fingerprint, fingerprint_legacy: fingerprintLegacy })
                        .eq('id', legacyGuest.id);
                }
            }

            // Fetch network/IP info (only works in production)
            const networkInfo = await fetchNetworkInfo();

            // Abuse + identity signals
            const geoMismatch = computeGeoMismatch(
                deviceInfo.timezone,
                (networkInfo?.network_info as any)?.timezone
            );
            const emailIntel = email ? await fetchEmailIntel(email) : null;

            let newGuestId: string;
            let currentPostCount: number;

            if (!existingGuest) {
                // Create new guest with network info
                const { data: insertedGuest, error: insertError } = await supabase
                    .from('guests')
                    .insert({
                        fingerprint,
                        fingerprint_legacy: fingerprintLegacy || null,
                        session_id: sessionId,
                        email: email || null,
                        device_info: deviceInfo,
                        flags: ['new'],
                        post_count: 0,
                        status: 'active',
                        trust_score: 50,
                        // Include IP/network data
                        ip_hash: networkInfo?.ip_hash || null,
                        country: networkInfo?.country || null,
                        city: networkInfo?.city || null,
                        isp: networkInfo?.isp || null,
                        vpn_detected: networkInfo?.vpn_detected || false,
                        tor_detected: networkInfo?.tor_detected || false,
                        // Rich network profile (dual-provider)
                        proxy_detected: networkInfo?.proxy_detected || false,
                        hosting_detected: networkInfo?.hosting_detected || false,
                        mobile_detected: networkInfo?.mobile_detected || false,
                        network_info: networkInfo?.network_info || {},
                        // Abuse signals + first-touch attribution
                        geo_mismatch: geoMismatch,
                        referrer: firstTouch?.referrer || null,
                        landing_page: firstTouch?.landing_page || null,
                        utm: firstTouch?.utm || {},
                        // Email intelligence
                        disposable_email_detected: emailIntel?.disposable || false,
                        email_mx_valid: emailIntel?.mx_valid ?? null,
                        gravatar_hash: emailIntel?.gravatar_hash || null,
                        has_gravatar: emailIntel?.has_gravatar || false
                    })
                    .select('id, anonymous_id, status, post_count, email, trust_score')
                    .single();

                if (insertError) {
                    console.error('Error creating guest:', insertError.message);
                    setError(insertError.message);
                    return { guestId: null, anonymousId: null, status: null, postCount: 0, requiresEmail: false };
                }

                newGuestId = insertedGuest.id;
                currentPostCount = 0;
                existingGuest = insertedGuest;
            } else {
                // Update existing guest
                newGuestId = existingGuest.id;
                currentPostCount = existingGuest.post_count || 0;

                // Update last seen, network info, and optionally email
                const updateData: any = {
                    last_seen_at: new Date().toISOString(),
                    session_id: sessionId,
                    device_info: deviceInfo,
                };
                if (fingerprintLegacy) updateData.fingerprint_legacy = fingerprintLegacy;
                if (email) {
                    updateData.email = email;
                }
                // Always update network info (might have been null before)
                if (networkInfo) {
                    updateData.ip_hash = networkInfo.ip_hash;
                    updateData.country = networkInfo.country;
                    updateData.city = networkInfo.city;
                    updateData.isp = networkInfo.isp;
                    updateData.vpn_detected = networkInfo.vpn_detected;
                    updateData.tor_detected = networkInfo.tor_detected;
                    updateData.proxy_detected = networkInfo.proxy_detected || false;
                    updateData.hosting_detected = networkInfo.hosting_detected || false;
                    updateData.mobile_detected = networkInfo.mobile_detected || false;
                    updateData.network_info = networkInfo.network_info || {};
                }
                // Refresh abuse signal every visit (attribution is first-touch only, not overwritten)
                updateData.geo_mismatch = geoMismatch;
                if (emailIntel) {
                    updateData.disposable_email_detected = emailIntel.disposable || false;
                    updateData.email_mx_valid = emailIntel.mx_valid ?? null;
                    updateData.gravatar_hash = emailIntel.gravatar_hash || null;
                    updateData.has_gravatar = emailIntel.has_gravatar || false;
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

            // === SECURE IP LOGGING + AUTO-CLAIM OLD POSTS ===
            // Call RPC to capture Real IP and claim any old posts from same IP
            try {
                const { data: claimResult } = await supabase.rpc('log_guest_security_with_claim', {
                    p_guest_id: newGuestId,
                    p_ip_hash: networkInfo?.ip_hash || null,
                    p_ip_encrypted: networkInfo?.ip_encrypted || null,
                    p_ip_source: networkInfo?.ip_source || null,
                    p_vpn_detected: networkInfo?.vpn_detected || false,
                    p_tor_detected: networkInfo?.tor_detected || false
                });

                if (claimResult?.claimed_posts > 0) {
                    console.log(`[GuestFingerprint] Claimed ${claimResult.claimed_posts} old posts for this guest`);
                    // Update local post count
                    currentPostCount += claimResult.claimed_posts;
                }
            } catch (rpcError) {
                // Fallback to old function if new one doesn't exist yet
                try {
                    await supabase.rpc('log_guest_security', {
                        p_guest_id: newGuestId,
                        p_isp: networkInfo?.isp || null,
                        p_vpn_detected: networkInfo?.vpn_detected || false,
                        p_tor_detected: networkInfo?.tor_detected || false
                    });
                } catch (fallbackError) {
                    console.warn('Secure logging warning:', fallbackError);
                }
            }

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
                anonymousId: existingGuest?.anonymous_id || null,
                status: existingGuest?.status || 'active',
                postCount: currentPostCount,
                requiresEmail,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(message);
            console.error('Guest creation error:', err);
            return { guestId: null, anonymousId: null, status: null, postCount: 0, requiresEmail: false };
        } finally {
            setIsLoading(false);
        }
    }, [fingerprint, fingerprintLegacy, deviceInfo, firstTouch]);

    // Refresh guest data (useful after verification)
    const refreshGuestData = useCallback(async () => {
        if (!guestId) return;
        try {
            const { data } = await supabase
                .from('guests')
                .select('id, anonymous_id, status, post_count, email, email_verified, trust_score')
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
        anonymousId: guestData?.anonymous_id || null,
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
