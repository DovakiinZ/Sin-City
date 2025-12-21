import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Secret salt for IP hashing - should be in environment variable
const IP_SALT = process.env.IP_HASH_SALT || 'sin-city-guest-salt-2024';

// Known VPN/Datacenter ASNs (simplified list)
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

// Known Tor exit node indicator
const TOR_INDICATORS = ['tor', 'exit', 'relay'];

interface GeoData {
    ip_hash: string;
    country: string;
    city: string;
    isp: string;
    vpn_detected: boolean;
    tor_detected: boolean;
}

// Hash IP with salt - never store raw IP
function hashIP(ip: string): string {
    return crypto
        .createHash('sha256')
        .update(ip + IP_SALT)
        .digest('hex')
        .substring(0, 32); // Truncate for efficiency
}

// Check if ISP/org name suggests VPN or datacenter
function detectVPN(isp: string, org: string, asn: string): boolean {
    const combined = `${isp} ${org} ${asn}`.toLowerCase();

    // Check known VPN ASNs
    if (VPN_ASNS.some(vpnAsn => asn?.includes(vpnAsn))) {
        return true;
    }

    // Check for VPN-related keywords
    const vpnKeywords = ['vpn', 'proxy', 'hosting', 'datacenter', 'cloud', 'server', 'vps'];
    return vpnKeywords.some(kw => combined.includes(kw));
}

// Check for Tor indicators
function detectTor(isp: string, org: string): boolean {
    const combined = `${isp} ${org}`.toLowerCase();
    return TOR_INDICATORS.some(ind => combined.includes(ind));
}

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get IP from headers (Vercel sets these)
        const ip = (
            req.headers['x-real-ip'] ||
            req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
            req.socket?.remoteAddress ||
            'unknown'
        ) as string;

        // Skip localhost/private IPs
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return res.status(200).json({
                ip_hash: hashIP(ip),
                country: 'Local',
                city: 'Development',
                isp: 'localhost',
                vpn_detected: false,
                tor_detected: false,
            } as GeoData);
        }

        // Call ip-api.com for geolocation (free, 45 req/min)
        const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,org,as`);

        if (!geoResponse.ok) {
            throw new Error('Geo API failed');
        }

        const geoData = await geoResponse.json();

        if (geoData.status !== 'success') {
            // Return basic data if geo lookup fails
            return res.status(200).json({
                ip_hash: hashIP(ip),
                country: 'Unknown',
                city: 'Unknown',
                isp: 'Unknown',
                vpn_detected: false,
                tor_detected: false,
            } as GeoData);
        }

        const result: GeoData = {
            ip_hash: hashIP(ip),
            country: geoData.country || 'Unknown',
            city: geoData.city || 'Unknown',
            isp: geoData.isp || 'Unknown',
            vpn_detected: detectVPN(geoData.isp || '', geoData.org || '', geoData.as || ''),
            tor_detected: detectTor(geoData.isp || '', geoData.org || ''),
        };

        return res.status(200).json(result);

    } catch (error) {
        console.error('Guest init error:', error);
        return res.status(500).json({
            error: 'Failed to initialize guest',
            ip_hash: 'error',
            country: 'Unknown',
            city: 'Unknown',
            isp: 'Unknown',
            vpn_detected: false,
            tor_detected: false,
        });
    }
}
