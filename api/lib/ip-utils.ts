import crypto from 'node:crypto';
import { isIP } from 'node:net';

// Environment variables for security
const IP_SALT = process.env.IP_HASH_SALT || 'sin-city-guest-salt-2024';

// Private IP ranges to filter out
const PRIVATE_IP_PATTERNS = [
    /^127\./,                    // Localhost
    /^10\./,                     // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B
    /^192\.168\./,               // Private Class C
    /^169\.254\./,               // Link-local
    /^f[cd][0-9a-f]{2}:/i,       // IPv6 unique-local (fc00::/7)
    /^fe[89ab][0-9a-f]:/i,       // IPv6 link-local (fe80::/10)
    /^::1$/,                     // IPv6 localhost
    /^::$/,                      // IPv6 unspecified
    /^0\.0\.0\.0$/,              // Unspecified IPv4
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
];

export interface IPExtractionResult {
    ip: string;
    realIp: string | null;  // Plain text real IP for admin storage (never sent to client)
    source: 'vercel' | 'cf' | 'cf-true' | 'xff' | 'real' | 'socket' | 'unknown';
    isPrivate: boolean;
    allHeaders: Record<string, string | undefined>;
}

/**
 * Normalize IP address:
 * - Trim whitespace, lowercase (IPv6 hex)
 * - Strip brackets / port ([2001:db8::1]:443, 1.2.3.4:443) and IPv6 zone ids
 * - Strip IPv6-mapped IPv4 prefixes (::ffff:)
 * - Handle IPv4-compatible IPv6 (::192.168.1.1)
 */
export function normalizeIP(ip: string | null | undefined): string {
    if (!ip) return 'unknown';

    let normalized = ip.trim().toLowerCase();

    const bracketed = normalized.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed) normalized = bracketed[1];
    else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(normalized)) normalized = normalized.split(':')[0];

    // Drop IPv6 zone id (fe80::1%eth0)
    normalized = normalized.split('%')[0];

    // Strip IPv6-mapped IPv4 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
    if (normalized.startsWith('::ffff:') && normalized.includes('.')) {
        normalized = normalized.substring(7);
    }

    // Strip IPv4-compatible IPv6 prefix (::192.168.1.1 -> 192.168.1.1)
    if (normalized.startsWith('::') && normalized.includes('.')) {
        normalized = normalized.substring(2);
    }

    return normalized || 'unknown';
}

/**
 * Extract the real client IP from request headers.
 *
 * Order matters. Vercel sets x-vercel-forwarded-for / x-real-ip / x-forwarded-for
 * itself from the TCP connection and overwrites whatever the client sent, so those
 * cannot be spoofed. The CDN headers (cf-connecting-ip, true-client-ip) are
 * client-controllable when the site is not actually behind that CDN, so they are
 * only a last resort.
 *
 * SECURITY: realIp is only for server-side storage (admin visibility).
 */
export function getClientIP(req: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
}): IPExtractionResult {
    // Collect all IP-related headers for debugging
    const allHeaders: Record<string, string | undefined> = {
        'cf-connecting-ip': getHeader(req.headers, 'cf-connecting-ip'),
        'true-client-ip': getHeader(req.headers, 'true-client-ip'),
        'x-forwarded-for': getHeader(req.headers, 'x-forwarded-for'),
        'x-real-ip': getHeader(req.headers, 'x-real-ip'),
        'x-client-ip': getHeader(req.headers, 'x-client-ip'),
        'x-vercel-forwarded-for': getHeader(req.headers, 'x-vercel-forwarded-for'),
        'socket': req.socket?.remoteAddress,
    };

    let ip = 'unknown';
    let source: IPExtractionResult['source'] = 'unknown';

    // Take the first public address from a (possibly comma-separated) header,
    // falling back to its first valid entry.
    const tryExtract = (header: string | undefined, src: IPExtractionResult['source']): boolean => {
        if (!header) return false;
        const ips = header.split(',').map(s => normalizeIP(s));
        const chosen = ips.find(c => isValidIP(c) && !isPrivateIP(c)) || (isValidIP(ips[0]) ? ips[0] : null);
        if (!chosen) return false;
        ip = chosen;
        source = src;
        return true;
    };

    const _found =
        tryExtract(allHeaders['x-vercel-forwarded-for'], 'vercel') ||
        tryExtract(allHeaders['x-real-ip'], 'real') ||
        tryExtract(allHeaders['x-forwarded-for'], 'xff') ||
        tryExtract(allHeaders['cf-connecting-ip'], 'cf') ||
        tryExtract(allHeaders['true-client-ip'], 'cf-true') ||
        tryExtract(allHeaders['socket'], 'socket');

    const isPrivate = isPrivateIP(ip);

    return {
        ip,
        realIp: isPrivate ? null : ip,  // Store real IP only if public (for admin)
        source,
        isPrivate,
        allHeaders,
    };
}

/**
 * Get a single header value from headers object
 */
function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const value = headers[key];
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}

/**
 * Check if string is a valid IP address (IPv4 or IPv6)
 */
export function isValidIP(ip: string): boolean {
    if (!ip || ip === 'unknown') return false;
    return isIP(ip) !== 0;
}

/**
 * Check if IP is in a private/reserved range
 */
export function isPrivateIP(ip: string): boolean {
    if (!ip || ip === 'unknown') return true;
    return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

/**
 * Hash IP with salt using SHA-256 (for matching/rate-limiting)
 * This is safe to return to clients for deduplication
 */
export function hashIP(ip: string): string {
    return crypto
        .createHash('sha256')
        .update(ip + IP_SALT)
        .digest('hex')
        .substring(0, 32); // Truncate for efficiency
}

/**
 * Mask IP for semi-public display (e.g., 192.168.xxx.xxx)
 * Used for limited visibility contexts
 */
export function maskIP(ip: string): string {
    if (!ip || ip === 'unknown') return 'unknown';

    // IPv4: mask last two octets
    if (ip.includes('.')) {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.xxx.xxx`;
        }
    }

    // IPv6: mask last 4 groups
    if (ip.includes(':')) {
        const parts = ip.split(':');
        if (parts.length >= 4) {
            return parts.slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx';
        }
    }

    return 'xxx.xxx.xxx.xxx';
}
