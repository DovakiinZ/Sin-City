import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'node:crypto';

// ============================================================
// IP UTILITIES (inlined)
// ============================================================
const IP_SALT = process.env.IP_HASH_SALT || 'sin-city-guest-salt-2024';
const PRIVATE_IP_PATTERNS = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./, /^169\.254\./, /^fc00:/i, /^fd00:/i,
    /^fe80:/i, /^::1$/, /^::$/, /^0\.0\.0\.0$/,
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
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(ip);
}
function isPrivateIP(ip: string): boolean {
    if (!ip || ip === 'unknown') return true;
    return PRIVATE_IP_PATTERNS.some(p => p.test(ip));
}
function hashIP(ip: string): string {
    return createHash('sha256').update(ip + IP_SALT).digest('hex').substring(0, 32);
}
function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const v = headers[key]; return Array.isArray(v) ? v[0] : v;
}
function getClientIP(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }) {
    const allHeaders: Record<string, string | undefined> = {
        'cf-connecting-ip': getHeader(req.headers, 'cf-connecting-ip'),
        'x-forwarded-for': getHeader(req.headers, 'x-forwarded-for'),
        'x-real-ip': getHeader(req.headers, 'x-real-ip'),
        'x-vercel-forwarded-for': getHeader(req.headers, 'x-vercel-forwarded-for'),
        'socket': req.socket?.remoteAddress,
    };
    let ip = 'unknown', source = 'unknown';
    const tryE = (h: string | undefined, s: string): boolean => {
        if (!h) return false;
        const ips = h.split(',').map(x => normalizeIP(x.trim()));
        for (const c of ips) { if (isValidIP(c) && !isPrivateIP(c)) { ip = c; source = s; return true; } }
        if (ips.length > 0 && isValidIP(ips[0])) { ip = ips[0]; source = s; return true; }
        return false;
    };
    const _ = tryE(allHeaders['x-vercel-forwarded-for'], 'vercel') || tryE(allHeaders['cf-connecting-ip'], 'cf') ||
    tryE(allHeaders['x-forwarded-for'], 'xff') || tryE(allHeaders['x-real-ip'], 'real') || tryE(allHeaders['socket'], 'socket');
    return { ip, realIp: isPrivateIP(ip) ? null : ip, source, isPrivate: isPrivateIP(ip), allHeaders };
}

/**
 * IDENTITY INIT ENDPOINT
 * 
 * Core principle: Every request resolves to exactly ONE identity (user or anon)
 * 
 * This endpoint:
 * 1. Generates secure anon_token server-side (never client-generated)
 * 2. Captures real IP, user-agent, device, browser, OS, geo
 * 3. Returns only anon_token to client (never exposes raw IP)
 * 4. Implements soft-linking for returning visitors
 */

// Known VPN/Datacenter ASNs
const VPN_ASNS = [
    'AS9009',   // M247 (many VPNs)
    'AS16509',  // Amazon AWS
    'AS14618',  // Amazon AWS
    'AS15169',  // Google Cloud
    'AS396982', // Google Cloud
    'AS8075',   // Microsoft Azure
    'AS13335',  // Cloudflare
    'AS20473',  // Vultr
    'AS14061',  // DigitalOcean
    'AS63949',  // PrivateSystems (VPNs)
    'AS209854', // Surfshark
    'AS212238', // Datacamp
];

const TOR_INDICATORS = ['tor', 'exit', 'relay'];

interface IdentityResponse {
    success: boolean;
    anon_token: string;
    anon_id: string;
    status: 'active' | 'blocked' | 'restricted';
    trust_score: number;
    is_new: boolean;
    match_type: 'token' | 'fingerprint' | 'soft_link' | 'created';

    // Geo data (safe for client)
    country: string;
    city: string;

    // NEVER exposed to client
    _server_data?: {
        real_ip: string | null;
        ip_source: string;
        isp: string;
        vpn_detected: boolean;
        tor_detected: boolean;
    };
}

function detectVPN(isp: string, org: string, asn: string): boolean {
    const combined = `${isp} ${org} ${asn}`.toLowerCase();
    if (VPN_ASNS.some(vpnAsn => asn?.includes(vpnAsn))) return true;
    const vpnKeywords = ['vpn', 'proxy', 'hosting', 'datacenter', 'cloud', 'server', 'vps'];
    return vpnKeywords.some(kw => combined.includes(kw));
}

function detectTor(isp: string, org: string): boolean {
    const combined = `${isp} ${org}`.toLowerCase();
    return TOR_INDICATORS.some(ind => combined.includes(ind));
}

function generateSecureToken(): string {
    return randomBytes(32).toString('hex');
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

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const body = req.body || {};
        const {
            anon_token,      // Existing token from client (if any)
            fingerprint,     // Browser fingerprint
            session_id,      // Browser session
            device_info,     // Device metadata
        } = body;

        // Extract IP
        const ipResult = getClientIP(req as any);
        const { ip, realIp, source, isPrivate } = ipResult;
        const ipHash = hashIP(ip);

        // Get geo data (skip for private IPs)
        let country = 'Unknown';
        let city = 'Unknown';
        let isp = 'Unknown';
        let vpnDetected = false;
        let torDetected = false;
        let proxyDetected = false;
        let hostingDetected = false;
        let mobileDetected = false;
        let networkInfo: Record<string, any> = { country, city, isp, providers: [] };

        if (!isPrivate) {
            const geo = await lookupGeo(ip, req.headers);
            country = geo.country;
            city = geo.city;
            isp = geo.isp;
            proxyDetected = geo.proxy;
            hostingDetected = geo.hosting;
            mobileDetected = geo.mobile;
            vpnDetected = geo.proxy || geo.hosting || detectVPN(geo.isp, geo.org, geo.asn);
            torDetected = detectTor(geo.isp, geo.org);
            networkInfo = {
                country: geo.country, country_code: geo.country_code, city: geo.city,
                region: geo.region, postal: geo.postal,
                latitude: geo.latitude, longitude: geo.longitude,
                timezone: geo.timezone, continent: geo.continent,
                isp: geo.isp, org: geo.org, asn: geo.asn, isp_domain: geo.isp_domain,
                is_eu: geo.is_eu, proxy: geo.proxy, hosting: geo.hosting, mobile: geo.mobile,
                vpn_detected: vpnDetected, tor_detected: torDetected, providers: geo.providers,
            };
        } else {
            country = 'Local';
            city = 'Development';
            isp = 'localhost';
            networkInfo = { country, city, isp, providers: [] };
        }

        // =====================================================================
        // IDENTITY RESOLUTION
        // This will be called via Supabase RPC from the client
        // For now, we return the data needed for the client to call resolve_anon_identity
        // =====================================================================

        const response: IdentityResponse = {
            success: true,
            anon_token: anon_token || generateSecureToken(), // Generate new if not provided
            anon_id: '', // Will be filled by resolve_anon_identity RPC
            status: 'active',
            trust_score: 50,
            is_new: !anon_token, // New if no token provided
            match_type: anon_token ? 'token' : 'created',
            country,
            city,
            _server_data: {
                real_ip: realIp,
                ip_source: source,
                isp,
                vpn_detected: vpnDetected,
                tor_detected: torDetected,
            },
        };

        // Prepare data for Supabase RPC call
        const identityParams = {
            p_anon_token: anon_token || null,
            p_fingerprint: fingerprint || null,
            p_session_id: session_id || null,
            p_device_info: device_info || {},
            p_ip_address: realIp, // Plain IP for server-side storage
            p_ip_hash: ipHash,
            p_country: country,
            p_city: city,
            p_isp: isp,
            p_vpn_detected: vpnDetected,
            p_tor_detected: torDetected,
            p_legacy_guest_id: body.legacy_guest_id || null, // New parameter for migration
        };

        // Return response with identity params for client RPC call
        return res.status(200).json({
            ...response,
            // Rich network profile (safe subset for client persistence)
            proxy_detected: proxyDetected,
            hosting_detected: hostingDetected,
            mobile_detected: mobileDetected,
            network_info: networkInfo,
            // Include params for client to call resolve_anon_identity
            _identity_params: identityParams,
        });

    } catch (error) {
        console.error('[identity-init] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to initialize identity',
        });
    }
}
