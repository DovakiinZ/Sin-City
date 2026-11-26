import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClientIP, hashIP, maskIP } from './lib/ip-utils.js';
import { lookupNetwork, toNetworkInfo, type NetworkProfile } from '../lib/network.js';
import { getServiceClient } from '../lib/verification-db.js';

/**
 * GET  /api/guest-init  -> network profile for the calling visitor (guest tracking).
 * POST /api/guest-init  -> "visit" check-in. Decides whether the connection may use
 *                          the site (VPN gate) and, when a valid Supabase session
 *                          token is sent, records the visit server-side: last
 *                          activity + the IP this request really came from.
 *
 * The IP is read from the request here and written with the service role, so a
 * browser can neither omit nor forge what the admin panel shows.
 */

// ---- site setting: block_vpn (cached per instance) ----
const SETTING_TTL_MS = 30_000;
let settingCache: { at: number; value: boolean } | null = null;

async function isVpnBlockEnabled(): Promise<boolean> {
    if (settingCache && Date.now() - settingCache.at < SETTING_TTL_MS) return settingCache.value;
    let value = false; // fail open: no setting row / no DB access => do not block
    try {
        const { data } = await getServiceClient().from('site_settings').select('value').eq('id', 'block_vpn').maybeSingle();
        value = data?.value === true || data?.value === 'true';
    } catch (e) {
        console.error('[guest-init] block_vpn setting read failed:', e);
    }
    settingCache = { at: Date.now(), value };
    return value;
}

function clip(v: unknown, max: number): string | null {
    return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;
}

function tzRegion(tz: string): string {
    return (tz.split('/')[0] || '').toLowerCase();
}

async function handleVisit(req: VercelRequest, res: VercelResponse) {
    const { ip, realIp, source, isPrivate } = getClientIP(req as any);
    const body = (req.body && typeof req.body === 'object') ? req.body : {};

    // Who is calling? (optional — guests check in without a token)
    let userId: string | null = null;
    let isAdmin = false;
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) {
        try {
            const svc = getServiceClient();
            const { data: { user } } = await svc.auth.getUser(token);
            if (user) {
                userId = user.id;
                const { data: prof } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
                isAdmin = prof?.role === 'admin';
            }
        } catch (e) {
            console.error('[guest-init] auth lookup failed:', e);
        }
    }

    const net: NetworkProfile | null = isPrivate ? null : await lookupNetwork(ip, req.headers);
    const known = !!net && net.providers.length > 0; // at least one provider answered

    // Record the visit for signed-in users.
    let recorded = false;
    if (userId) {
        const data: Record<string, unknown> = { ip_hash: hashIP(ip), ip_source: source };
        if (net && known) {
            Object.assign(data, {
                country: net.country, city: net.city, isp: net.isp,
                vpn_detected: net.vpn_detected, tor_detected: net.tor_detected,
                proxy_detected: net.proxy, hosting_detected: net.hosting, mobile_detected: net.mobile,
            });
            const device = body.device && typeof body.device === 'object' && JSON.stringify(body.device).length < 4000
                ? body.device : undefined;
            data.network_info = { ...toNetworkInfo(net), ...(device ? { device } : {}) };
            const browserTz = clip(body.browser_tz, 64);
            if (browserTz && net.timezone) data.geo_mismatch = tzRegion(browserTz) !== tzRegion(net.timezone);
        }
        const ft = body.first_touch && typeof body.first_touch === 'object' ? body.first_touch : {};
        const referrer = clip(ft.referrer, 500);
        const landing = clip(ft.landing_page, 500);
        if (referrer) data.referrer = referrer;
        if (landing) data.landing_page = landing;
        if (ft.utm && typeof ft.utm === 'object' && JSON.stringify(ft.utm).length < 1000) data.utm = ft.utm;

        try {
            const { error } = await getServiceClient().rpc('record_user_visit', {
                p_user_id: userId, p_ip: realIp, p_data: data,
            });
            if (error) console.error('[guest-init] record_user_visit failed:', error.message);
            else recorded = true;
        } catch (e) {
            console.error('[guest-init] record_user_visit threw:', e);
        }
    }

    // VPN gate. Admins are never locked out; an unknown network is never blocked.
    const flagged = !!net && known && (net.vpn_detected || net.tor_detected);
    const blocked = flagged && !isAdmin && (await isVpnBlockEnabled());

    return res.status(200).json({
        ok: true,
        recorded,
        access: { blocked, reason: blocked ? (net!.tor_detected ? 'tor' : 'vpn') : null },
        vpn_detected: !!net?.vpn_detected,
        tor_detected: !!net?.tor_detected,
        country: net?.country ?? (isPrivate ? 'Local' : 'Unknown'),
        city: net?.city ?? (isPrivate ? 'Development' : 'Unknown'),
    });
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        try {
            return await handleVisit(req, res);
        } catch (error) {
            console.error('[guest-init] visit error:', error);
            // Fail open: a server fault must not lock visitors out.
            return res.status(200).json({ ok: false, recorded: false, access: { blocked: false, reason: null } });
        }
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const debugMode = req.query.debug_ip === '1';

    try {
        const { ip, realIp, source, isPrivate: priv, allHeaders } = getClientIP(req as any);

        if (priv) {
            const result: any = {
                ip_hash: hashIP(ip), ip_source: source,
                country: 'Local', city: 'Development', isp: 'localhost',
                vpn_detected: false, tor_detected: false,
                proxy_detected: false, hosting_detected: false, mobile_detected: false,
                network_info: { country: 'Local', city: 'Development', isp: 'localhost', providers: [] },
                _server_data: { real_ip: null },
            };
            if (debugMode) result.debug = { all_headers: allHeaders, selected_source: source, is_private: true, raw_ip_masked: maskIP(ip) };
            return res.status(200).json(result);
        }

        const net = await lookupNetwork(ip, req.headers);

        const result: any = {
            ip_hash: hashIP(ip), ip_source: source,
            country: net.country, city: net.city, isp: net.isp,
            region: net.region, timezone: net.timezone, asn: net.asn,
            vpn_detected: net.vpn_detected, tor_detected: net.tor_detected,
            proxy_detected: net.proxy, hosting_detected: net.hosting, mobile_detected: net.mobile,
            network_info: toNetworkInfo(net),
            _server_data: { real_ip: realIp },
            ip_encrypted: realIp,
        };
        if (debugMode) result.debug = { all_headers: allHeaders, selected_source: source, is_private: false, raw_ip_masked: maskIP(ip) };

        return res.status(200).json(result);
    } catch (error) {
        console.error('Guest init error:', error);
        return res.status(500).json({
            error: 'Failed to initialize guest',
            ip_hash: 'error', country: 'Unknown', city: 'Unknown', isp: 'Unknown',
            vpn_detected: false, tor_detected: false,
        });
    }
}
