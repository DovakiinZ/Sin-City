import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';

// ============================================================
// IP UTILITIES (inlined to avoid import resolution issues)
// ============================================================
const IP_SALT = process.env.IP_HASH_SALT || 'sin-city-guest-salt-2024';

const PRIVATE_IP_PATTERNS = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./, /^169\.254\./, /^fc00:/i, /^fd00:/i,
    /^fe80:/i, /^::1$/, /^::$/, /^0\.0\.0\.0$/,
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
];

function normalizeIP(ip: string | null | undefined): string {
    if (!ip) return 'unknown';
    let n = ip.trim();
    if (n.toLowerCase().startsWith('::ffff:')) n = n.substring(7);
    if (n.startsWith('::') && n.includes('.')) n = n.substring(2);
    return n || 'unknown';
}

function isValidIP(ip: string): boolean {
    if (!ip || ip === 'unknown') return false;
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ||
        /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(ip);
}

function isPrivateIP(ip: string): boolean {
    if (!ip || ip === 'unknown') return true;
    return PRIVATE_IP_PATTERNS.some(p => p.test(ip));
}

function hashIP(ip: string): string {
    return createHash('sha256').update(ip + IP_SALT).digest('hex').substring(0, 32);
}

function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const v = headers[key];
    return Array.isArray(v) ? v[0] : v;
}

function getClientIP(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }) {
    const allHeaders: Record<string, string | undefined> = {
        'cf-connecting-ip': getHeader(req.headers, 'cf-connecting-ip'),
        'true-client-ip': getHeader(req.headers, 'true-client-ip'),
        'x-forwarded-for': getHeader(req.headers, 'x-forwarded-for'),
        'x-real-ip': getHeader(req.headers, 'x-real-ip'),
        'x-vercel-forwarded-for': getHeader(req.headers, 'x-vercel-forwarded-for'),
        'socket': req.socket?.remoteAddress,
    };

    let ip = 'unknown';
    let source = 'unknown';

    const tryExtract = (header: string | undefined, src: string): boolean => {
        if (!header) return false;
        const ips = header.split(',').map(s => normalizeIP(s.trim()));
        for (const c of ips) {
            if (isValidIP(c) && !isPrivateIP(c)) { ip = c; source = src; return true; }
        }
        if (ips.length > 0 && isValidIP(ips[0])) { ip = ips[0]; source = src; return true; }
        return false;
    };

    const _ = tryExtract(allHeaders['x-vercel-forwarded-for'], 'vercel') ||
    tryExtract(allHeaders['cf-connecting-ip'], 'cf') ||
    tryExtract(allHeaders['true-client-ip'], 'cf-true') ||
    tryExtract(allHeaders['x-forwarded-for'], 'xff') ||
    tryExtract(allHeaders['x-real-ip'], 'real') ||
    tryExtract(allHeaders['socket'], 'socket');

    return { ip, realIp: isPrivateIP(ip) ? null : ip, source, isPrivate: isPrivateIP(ip), allHeaders };
}

// ============================================================
// VPN / TOR DETECTION
// ============================================================
const VPN_ASNS = ['AS9009','AS16509','AS14618','AS15169','AS396982','AS8075','AS13335','AS20473','AS14061','AS63949','AS209854','AS212238'];

function detectVPN(isp: string, org: string, asn: string): boolean {
    const combined = `${isp} ${org} ${asn}`.toLowerCase();
    if (VPN_ASNS.some(a => asn?.includes(a))) return true;
    return ['vpn','proxy','hosting','datacenter','cloud','server','vps'].some(kw => combined.includes(kw));
}

function detectTor(isp: string, org: string): boolean {
    return ['tor','exit','relay'].some(ind => `${isp} ${org}`.toLowerCase().includes(ind));
}

function maskIP(ip: string): string {
    if (!ip || ip === 'unknown') return 'unknown';
    if (ip.includes('.')) { const p = ip.split('.'); if (p.length === 4) return `${p[0]}.${p[1]}.xxx.xxx`; }
    return 'xxx.xxx.xxx.xxx';
}

// ============================================================
// GEO LOOKUP (dual-provider, free, datacenter-friendly)
// Vercel edge headers (x-vercel-ip-*) give country/city for free on every
// request. We enrich in parallel with two free, keyless providers:
//   - ip-api.com -> real proxy / hosting / mobile flags + ISP/ASN (HTTP, 45 req/min)
//   - ipwho.is   -> postal, ASN org, ISP domain, is_eu (HTTPS)
// Results are merged so a single provider being down/rate-limited still yields
// data. ipapi.co was dropped: it now 403s all server-side requests behind Cloudflare.
// ============================================================
interface GeoResult {
    country: string; country_code: string; city: string; region: string; postal: string;
    latitude: number | null; longitude: number | null; timezone: string; continent: string;
    isp: string; org: string; asn: string; isp_domain: string;
    is_eu: boolean; proxy: boolean; hosting: boolean; mobile: boolean;
    providers: string[];
}

function getVercelGeo(headers: Record<string, string | string[] | undefined>) {
    let city = getHeader(headers, 'x-vercel-ip-city');
    if (city) { try { city = decodeURIComponent(city); } catch { /* keep raw */ } }
    return {
        country: getHeader(headers, 'x-vercel-ip-country') || null,
        city: city || null,
        region: getHeader(headers, 'x-vercel-ip-country-region') || null,
        latitude: getHeader(headers, 'x-vercel-ip-latitude') || null,
        longitude: getHeader(headers, 'x-vercel-ip-longitude') || null,
        timezone: getHeader(headers, 'x-vercel-ip-timezone') || null,
    };
}

async function fetchJSON(url: string, ms: number): Promise<any | null> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
    finally { clearTimeout(tid); }
}

async function lookupGeo(ip: string, headers: Record<string, string | string[] | undefined>): Promise<GeoResult> {
    const v = getVercelGeo(headers);
    const pick = (...vals: any[]) => vals.find(x => x !== undefined && x !== null && x !== '');
    const num = (x: any) => { const n = typeof x === 'number' ? x : parseFloat(x); return Number.isFinite(n) ? n : null; };

    const IPAPI_FIELDS = 'status,message,continent,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting';
    const [ipapi, ipwho] = await Promise.all([
        fetchJSON(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${IPAPI_FIELDS}`, 4000),
        fetchJSON(`https://ipwho.is/${encodeURIComponent(ip)}`, 4000),
    ]);

    const a = ipapi && ipapi.status === 'success' ? ipapi : null;
    const b = ipwho && ipwho.success !== false ? ipwho : null;
    const bc = (b && b.connection) || {};
    const providers: string[] = [];
    if (a) providers.push('ip-api');
    if (b) providers.push('ipwho');

    const asn = a?.as ? String(a.as).split(' ')[0] : (bc.asn ? `AS${bc.asn}` : '');

    return {
        country: pick(a?.country, b?.country, v.country, 'Unknown'),
        country_code: pick(a?.countryCode, b?.country_code, ''),
        city: pick(a?.city, b?.city, v.city, 'Unknown'),
        region: pick(a?.regionName, b?.region, v.region, ''),
        postal: pick(a?.zip, b?.postal, ''),
        latitude: num(pick(a?.lat, b?.latitude, v.latitude)),
        longitude: num(pick(a?.lon, b?.longitude, v.longitude)),
        timezone: pick(a?.timezone, b?.timezone?.id, v.timezone, ''),
        continent: pick(a?.continent, b?.continent, ''),
        isp: pick(a?.isp, bc.isp, bc.org, a?.org, 'Unknown'),
        org: pick(a?.org, bc.org, a?.isp, bc.isp, 'Unknown'),
        asn: asn || '',
        isp_domain: pick(bc.domain, ''),
        is_eu: Boolean(b?.is_eu),
        proxy: Boolean(a?.proxy),
        hosting: Boolean(a?.hosting),
        mobile: Boolean(a?.mobile),
        providers,
    };
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
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

        // Geo lookup: Vercel edge headers + ip-api.com + ipwho.is (parallel, merged)
        const geo = await lookupGeo(ip, req.headers);
        const vpn = geo.proxy || geo.hosting || detectVPN(geo.isp, geo.org, geo.asn);
        const tor = detectTor(geo.isp, geo.org);

        const network_info = {
            country: geo.country, country_code: geo.country_code, city: geo.city,
            region: geo.region, postal: geo.postal,
            latitude: geo.latitude, longitude: geo.longitude,
            timezone: geo.timezone, continent: geo.continent,
            isp: geo.isp, org: geo.org, asn: geo.asn, isp_domain: geo.isp_domain,
            is_eu: geo.is_eu, proxy: geo.proxy, hosting: geo.hosting, mobile: geo.mobile,
            vpn_detected: vpn, tor_detected: tor, providers: geo.providers,
        };

        const result: any = {
            ip_hash: hashIP(ip), ip_source: source,
            country: geo.country, city: geo.city, isp: geo.isp,
            region: geo.region, timezone: geo.timezone, asn: geo.asn,
            vpn_detected: vpn, tor_detected: tor,
            proxy_detected: geo.proxy, hosting_detected: geo.hosting, mobile_detected: geo.mobile,
            network_info,
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
