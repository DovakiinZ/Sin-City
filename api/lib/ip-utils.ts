import crypto from 'crypto';

// Environment variables for security
const IP_SALT = process.env.IP_HASH_SALT || 'sin-city-guest-salt-2024';
const ENCRYPTION_KEY = process.env.IP_ENCRYPTION_KEY || 'sin-city-ip-key-32chars!!'; // Must be 32 chars for AES-256

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
];

export interface IPExtractionResult {
    ip: string;
    source: 'cf' | 'cf-true' | 'xff' | 'real' | 'socket' | 'unknown';
    isPrivate: boolean;
    allHeaders: Record<string, string | undefined>;
}

/**
 * Extract the real client IP from request headers
 * Priority: CF-Connecting-IP > True-Client-IP > X-Forwarded-For > X-Real-IP > Socket
 */
export function getClientIP(req: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
}): IPExtractionResult {
    const allHeaders: Record<string, string | undefined> = {
        'cf-connecting-ip': getHeader(req.headers, 'cf-connecting-ip'),
        'true-client-ip': getHeader(req.headers, 'true-client-ip'),
        'x-forwarded-for': getHeader(req.headers, 'x-forwarded-for'),
        'x-real-ip': getHeader(req.headers, 'x-real-ip'),
        'x-client-ip': getHeader(req.headers, 'x-client-ip'),
        'socket': req.socket?.remoteAddress,
    };

    let ip = 'unknown';
    let source: IPExtractionResult['source'] = 'unknown';

    // 1. Cloudflare CF-Connecting-IP (highest priority)
    const cfIP = allHeaders['cf-connecting-ip'];
    if (cfIP && isValidIP(cfIP)) {
        ip = cfIP;
        source = 'cf';
    }
    // 2. True-Client-IP (Cloudflare Enterprise / Akamai)
    else if (allHeaders['true-client-ip'] && isValidIP(allHeaders['true-client-ip'])) {
        ip = allHeaders['true-client-ip']!;
        source = 'cf-true';
    }
    // 3. X-Forwarded-For (first non-private IP)
    else if (allHeaders['x-forwarded-for']) {
        const xff = allHeaders['x-forwarded-for'];
        const ips = xff.split(',').map(s => s.trim());
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
    // 4. X-Real-IP
    else if (allHeaders['x-real-ip'] && isValidIP(allHeaders['x-real-ip'])) {
        ip = allHeaders['x-real-ip']!;
        source = 'real';
    }
    // 5. Socket remote address (last resort)
    else if (allHeaders['socket'] && isValidIP(allHeaders['socket'])) {
        ip = allHeaders['socket']!;
        source = 'socket';
    }

    // Normalize IPv6-mapped IPv4
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    return {
        ip,
        source,
        isPrivate: isPrivateIP(ip),
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
 */
export function hashIP(ip: string): string {
    return crypto
        .createHash('sha256')
        .update(ip + IP_SALT)
        .digest('hex')
        .substring(0, 32); // Truncate for efficiency
}

/**
 * Encrypt IP using AES-256-CBC (for secure storage, admin decryption)
 */
export function encryptIP(ip: string): string {
    try {
        // Create 32-byte key from environment variable
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

        let encrypted = cipher.update(ip, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Return IV + encrypted data
        return iv.toString('hex') + ':' + encrypted;
    } catch {
        return 'encryption_failed';
    }
}

/**
 * Decrypt IP (for super-admin use only)
 */
export function decryptIP(encrypted: string): string {
    try {
        if (!encrypted || encrypted === 'encryption_failed') {
            return 'unknown';
        }

        const [ivHex, encryptedHex] = encrypted.split(':');
        if (!ivHex || !encryptedHex) return 'unknown';

        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch {
        return 'decryption_failed';
    }
}

/**
 * Mask IP for public/admin display (e.g., 192.168.xxx.xxx)
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
