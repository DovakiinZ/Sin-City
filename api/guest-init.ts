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
                _server_data: { real_ip: null },
            };
            if (debugMode) result.debug = { all_headers: allHeaders, selected_source: source, is_private: true, raw_ip_masked: maskIP(ip) };
            return res.status(200).json(result);
        }

        // Geo lookup with 5s timeout
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        let country = 'Unknown', city = 'Unknown', isp = 'Unknown', vpn = false, tor = false;

        try {
            const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: ctrl.signal });
            clearTimeout(tid);
            if (geoRes.ok) {
                const g = await geoRes.json();
                if (!g.error) {
                    country = g.country_name || 'Unknown';
                    city = g.city || 'Unknown';
                    isp = g.org || 'Unknown';
                    vpn = detectVPN(g.org || '', g.org || '', g.asn || '');
                    tor = detectTor(g.org || '', g.org || '');
                }
            }
        } catch { clearTimeout(tid); }

        const result: any = {
            ip_hash: hashIP(ip), ip_source: source,
            country, city, isp, vpn_detected: vpn, tor_detected: tor,
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
