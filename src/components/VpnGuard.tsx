import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { getSessionTouch } from '@/lib/tracking';

/**
 * Visit check-in + VPN gate.
 *
 * POSTs to /api/guest-init, which (a) records the visit server-side for signed-in
 * users — last activity and the IP the request really came from — and (b) answers
 * whether this connection may use the site. When the admin setting "block_vpn" is
 * on and the server sees a VPN / proxy / Tor exit, the site is replaced by a
 * "turn off your VPN" screen. Admins are exempt, and any failure fails open.
 */

const RECHECK_MS = 10 * 60 * 1000;
const CACHE_KEY = 'sin_city_access_gate';
// Sign-in stays reachable so an admin on a flagged network can still log in.
const ALLOW = ['/login', '/forgot-password', '/reset-password'];

type Gate = { blocked: boolean; reason: 'vpn' | 'tor' | null };

function readCache(): Gate {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) return JSON.parse(raw) as Gate;
    } catch { /* ignore */ }
    return { blocked: false, reason: null };
}

function deviceSnapshot() {
    const nav = navigator as any;
    return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform || 'unknown',
        screen: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
        pixelRatio: window.devicePixelRatio || 1,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceMemory: nav.deviceMemory || null,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    };
}

export default function VpnGuard({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const location = useLocation();
    const [gate, setGate] = useState<Gate>(readCache);
    const [checking, setChecking] = useState(false);
    const lastCheck = useRef(0);
    const inFlight = useRef(false);

    const check = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setChecking(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const device = deviceSnapshot();
            const touch = getSessionTouch(); // where this visit came from
            const res = await fetch('/api/guest-init', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({
                    device,
                    browser_tz: device.timezone,
                    touch: {
                        referrer: touch.referrer || null,
                        landing_page: touch.landing_page || null,
                        utm: touch.utm || {},
                        internal: touch.source === 'internal',
                    },
                }),
            });
            if (!res.ok) return; // fail open, keep the previous decision
            const json = await res.json();
            const next: Gate = { blocked: !!json?.access?.blocked, reason: json?.access?.reason ?? null };
            lastCheck.current = Date.now();
            setGate(next);
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        } catch {
            // Network error: fail open, keep the previous decision.
        } finally {
            inFlight.current = false;
            setChecking(false);
        }
    }, []);

    // Check on load and whenever the signed-in user changes (login / logout).
    useEffect(() => {
        check();
    }, [user?.id, check]);

    // Re-check periodically and when the tab comes back, so a VPN switched on
    // mid-session is caught and the recorded IP / last activity stay fresh.
    useEffect(() => {
        const recheckIfStale = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > RECHECK_MS) check();
        };
        const interval = setInterval(recheckIfStale, 60 * 1000);
        document.addEventListener('visibilitychange', recheckIfStale);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', recheckIfStale);
        };
    }, [check]);

    if (!gate.blocked || ALLOW.some(p => location.pathname.startsWith(p))) return <>{children}</>;

    const what = gate.reason === 'tor' ? 'Tor' : 'VPN / proxy';
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="ascii-box max-w-lg w-full p-6 space-y-4 text-center font-mono">
                <ShieldAlert className="w-10 h-10 mx-auto text-red-500" />
                <h1 className="text-lg font-bold text-red-400">ACCESS DENIED — {what.toUpperCase()} DETECTED</h1>
                <p className="text-sm ascii-dim">
                    This site can't be used over a {what} connection. Turn off your VPN, proxy
                    {' '}or iCloud Private Relay, then press retry.
                </p>
                <p className="text-sm ascii-dim" dir="rtl" lang="ar">
                    لا يمكن استخدام الموقع عبر اتصال VPN أو بروكسي. يرجى إيقاف تشغيل الـVPN ثم إعادة المحاولة.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                        onClick={check}
                        disabled={checking}
                        className="ascii-nav-link hover:ascii-highlight border border-green-700 px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                        {checking ? 'CHECKING...' : 'RETRY'}
                    </button>
                    {!user && (
                        <a href="/login" className="text-xs ascii-dim hover:underline">Staff sign in</a>
                    )}
                </div>
            </div>
        </div>
    );
}
