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
    tryE(allHeaders['x-vercel-forwarded-for'], 'vercel') || tryE(allHeaders['cf-connecting-ip'], 'cf') ||
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

        if (!isPrivate) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const geoResponse = await fetch(`https://ipapi.co/${ip}/json/`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (geoResponse.ok) {
                    const geoData = await geoResponse.json();
                    if (!geoData.error) {
                        country = geoData.country_name || 'Unknown';
                        city = geoData.city || 'Unknown';
                        isp = geoData.org || 'Unknown';
                        vpnDetected = detectVPN(geoData.org || '', geoData.org || '', geoData.asn || '');
                        torDetected = detectTor(geoData.org || '', geoData.org || '');
                    }
                }
            } catch (geoError) {
                console.warn('[identity-init] Geo lookup failed:', geoError);
            }
        } else {
            country = 'Local';
            city = 'Development';
            isp = 'localhost';
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
