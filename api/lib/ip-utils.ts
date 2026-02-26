import crypto from 'crypto';
import { getClientIp } from '@supercharge/request-ip';

// Environment variables for security
const IP_SALT = process.env.IP_HASH_SALT || 'sin-city-guest-salt-2024';

// Private IP ranges to filter out
const PRIVATE_IP_PATTERNS = [
    /^127\./,                    // Localhost
    /^10\./,                     // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B
    /^192\.168\./,               // Private Class C
    /^169\.254\./,               // Link-local
    /^fc00:/i,                   // IPv6 private
    /^fd00:/i,                   // IPv6 private
    /^fe80:/i,                   // IPv6 link-local
    /^::1$/,                     // IPv6 localhost
    /^::$/,                      // IPv6 unspecified
    /^0\.0\.0\.0$/,              // Unspecified IPv4
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
];

export interface IPExtractionResult {
    ip: string;
    realIp: string | null;  // Plain text real IP for admin storage (never sent to client)
    source: 'supercharge' | 'cf' | 'cf-true' | 'xff' | 'real' | 'socket' | 'unknown';
    isPrivate: boolean;
    allHeaders: Record<string, string | undefined>;
}

/**
 * Normalize IP address:
 * - Strip IPv6-mapped IPv4 prefixes (::ffff:)
 * - Trim whitespace
 * - Handle IPv4-compatible IPv6 (::192.168.1.1)
 */
export function normalizeIP(ip: string | null | undefined): string {
    if (!ip) return 'unknown';

    let normalized = ip.trim();

    // Strip IPv6-mapped IPv4 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
    if (normalized.toLowerCase().startsWith('::ffff:')) {
        normalized = normalized.substring(7);
    }

    // Strip IPv4-compatible IPv6 prefix (::192.168.1.1 -> 192.168.1.1)
    if (normalized.startsWith('::') && normalized.includes('.')) {
        normalized = normalized.substring(2);
    }

    return normalized || 'unknown';
}

/**
 * Extract the real client IP from request headers using @supercharge/request-ip
 * Priority: Uses library's built-in header detection, then fallback to manual checks
 * 
 * SECURITY: realIp is NEVER returned to clients - only stored server-side for admin access
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

    // 1. Use @supercharge/request-ip as primary source (handles many edge cases)
    const superchargeIp = getClientIp(req);
    if (superchargeIp && isValidIP(normalizeIP(superchargeIp))) {
        ip = normalizeIP(superchargeIp);
        source = 'supercharge';
    }
    // 2. Cloudflare CF-Connecting-IP (highest priority for Cloudflare users)
    else if (allHeaders['cf-connecting-ip'] && isValidIP(normalizeIP(allHeaders['cf-connecting-ip']))) {
        ip = normalizeIP(allHeaders['cf-connecting-ip']!);
        source = 'cf';
    }
    // 3. True-Client-IP (Cloudflare Enterprise / Akamai)
    else if (allHeaders['true-client-ip'] && isValidIP(normalizeIP(allHeaders['true-client-ip']))) {
        ip = normalizeIP(allHeaders['true-client-ip']!);
        source = 'cf-true';
    }
    // 4. X-Forwarded-For (first non-private IP)
    else if (allHeaders['x-forwarded-for']) {
        const xff = allHeaders['x-forwarded-for'];
        const ips = xff.split(',').map(s => normalizeIP(s.trim()));
        // Find first public IP
        for (const candidate of ips) {
            if (isValidIP(candidate) && !isPrivateIP(candidate)) {
                ip = candidate;
                source = 'xff';
                break;
            }
        }
        // Fallback to first IP if all are private
        if (ip === 'unknown' && ips.length > 0 && isValidIP(ips[0])) {
            ip = ips[0];
            source = 'xff';
        }
    }
    // 5. X-Real-IP
    else if (allHeaders['x-real-ip'] && isValidIP(normalizeIP(allHeaders['x-real-ip']))) {
        ip = normalizeIP(allHeaders['x-real-ip']!);
        source = 'real';
    }
    // 6. Socket remote address (last resort)
    else if (allHeaders['socket'] && isValidIP(normalizeIP(allHeaders['socket']))) {
        ip = normalizeIP(allHeaders['socket']!);
        source = 'socket';
    }

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

    // Basic IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    // Basic IPv6 pattern (simplified)
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    // IPv6-mapped IPv4
    const ipv4MappedPattern = /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i;

    return ipv4Pattern.test(ip) || ipv6Pattern.test(ip) || ipv4MappedPattern.test(ip);
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

// ============================================================
// REMOVED: encryptIP and decryptIP functions
// Real IP is now stored in plain text for admin-only visibility
// Security is enforced via RLS policies, not encryption
// ============================================================
