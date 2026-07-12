import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getFirstTouch } from '@/lib/tracking';

/**
 * First-party page-view / engagement tracker.
 * Logs page_view on every route change and page_leave (with dwell time and max
 * scroll depth) when leaving a page or hiding the tab. Insert-only; admins read.
 */
interface AnalyticsIds {
    userId?: string | null;
    guestId?: string | null;
}

const SID_KEY = 'sc_analytics_sid';

function getSessionId(): string {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
        sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
}

export function useAnalytics({ userId, guestId }: AnalyticsIds) {
    const location = useLocation();
    const enterRef = useRef<number>(Date.now());
    const maxScrollRef = useRef<number>(0);
    const pathRef = useRef<string>('');
    const idsRef = useRef<AnalyticsIds>({ userId, guestId });
    idsRef.current = { userId, guestId };

    const logEvent = (eventType: string, path: string, extraMeta: Record<string, unknown> = {}) => {
        try {
            const ft = getFirstTouch();
            const payload = {
                session_id: getSessionId(),
                guest_id: idsRef.current.guestId || null,
                user_id: idsRef.current.userId || null,
                event_type: eventType,
                path,
                title: document.title || null,
                referrer: document.referrer || null,
                meta: {
                    ...extraMeta,
                    utm: ft.utm,
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                },
            };
            // Fire-and-forget; never block navigation on analytics
            void supabase.from('analytics_events').insert(payload);
        } catch { /* ignore */ }
    };

    const flushLeave = () => {
        if (!pathRef.current) return;
        logEvent('page_leave', pathRef.current, {
            dwell_ms: Date.now() - enterRef.current,
            scroll_depth: maxScrollRef.current,
        });
    };

    // Track max scroll depth on the current page
    useEffect(() => {
        const onScroll = () => {
            const doc = document.documentElement;
            const scrollable = doc.scrollHeight - doc.clientHeight;
            const pct = scrollable > 0 ? Math.min(100, Math.round((doc.scrollTop / scrollable) * 100)) : 0;
            if (pct > maxScrollRef.current) maxScrollRef.current = pct;
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Route change → leave previous page, enter new page
    useEffect(() => {
        const path = location.pathname + location.search;
        flushLeave();
        pathRef.current = path;
        enterRef.current = Date.now();
        maxScrollRef.current = 0;
        logEvent('page_view', path);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname, location.search]);

    // Flush dwell on tab hide / unload
    useEffect(() => {
        const onVisibility = () => { if (document.visibilityState === 'hidden') flushLeave(); };
        window.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', flushLeave);
        return () => {
            window.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', flushLeave);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

export default useAnalytics;
