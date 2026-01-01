import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClientIP, hashIP, isPrivateIP } from './lib/ip-utils';

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

/**
 * Response data sent to CLIENT
 * SECURITY: real_ip is NEVER included here
 */
interface ClientGeoData {
    ip_hash: string;
    ip_source?: string;     // Which header was used
    country: string;
    city: string;
    isp: string;
    vpn_detected: boolean;
    tor_detected: boolean;
    debug?: {              // Only included with debug_ip=1
        all_headers: Record<string, string | undefined>;
        selected_source: string;
        is_private: boolean;
        raw_ip_masked: string;
    };
}

/**
 * Internal data for SERVER-SIDE storage (ip_security_logs)
 * Contains real_ip in plain text for admin visibility
 */
interface ServerSecurityData {
    ip_hash: string;
    real_ip: string | null;   // Plain text IP for admin-only storage
    ip_source: string;
    country: string;
    city: string;
    isp: string;
    vpn_detected: boolean;
    tor_detected: boolean;
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

// Mask IP for debug output (e.g., 192.168.xxx.xxx)
function maskIPForDebug(ip: string): string {
    if (!ip || ip === 'unknown') return 'unknown';
    if (ip.includes('.')) {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.xxx.xxx`;
        }
    }
    return 'xxx.xxx.xxx.xxx';
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

    // Check for debug mode
    const debugMode = req.query.debug_ip === '1';

    try {
        // Extract IP using @supercharge/request-ip with our enhancements
        const ipResult = getClientIP(req as any);
        const { ip, realIp, source, isPrivate, allHeaders } = ipResult;

        console.log(`[guest-init] IP extracted: source=${source}, private=${isPrivate}, ip_masked=${maskIPForDebug(ip)}`);

        // Handle private/local IPs
        if (isPrivate) {
            const clientResult: ClientGeoData = {
                ip_hash: hashIP(ip),
                ip_source: source,
                country: 'Local',
                city: 'Development',
                isp: 'localhost',
                vpn_detected: false,
                tor_detected: false,
            };

            if (debugMode) {
                clientResult.debug = {
                    all_headers: allHeaders,
                    selected_source: source,
                    is_private: true,
                    raw_ip_masked: maskIPForDebug(ip),
                };
            }

            // Return response with _server_data for internal use (not exposed to browser)
            return res.status(200).json({
                ...clientResult,
                // Server-side only data (for RPC calls, not exposed to client display)
                _server_data: {
                    real_ip: null,  // Private IPs are never stored
                } as Partial<ServerSecurityData>
            });
        }

        // Call ip-api.com for geolocation (free, 45 req/min)
        const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,org,as`);

        if (!geoResponse.ok) {
            throw new Error('Geo API failed');
        }

        const geoData = await geoResponse.json();

        if (geoData.status !== 'success') {
            // Return basic data if geo lookup fails
            const clientResult: ClientGeoData = {
                ip_hash: hashIP(ip),
                ip_source: source,
                country: 'Unknown',
                city: 'Unknown',
                isp: 'Unknown',
                vpn_detected: false,
                tor_detected: false,
            };

            if (debugMode) {
                clientResult.debug = {
                    all_headers: allHeaders,
                    selected_source: source,
                    is_private: false,
                    raw_ip_masked: maskIPForDebug(ip),
                };
            }

            return res.status(200).json({
                ...clientResult,
                _server_data: {
                    real_ip: realIp,  // Store real IP for admin even if geo fails
                } as Partial<ServerSecurityData>
            });
        }

        const clientResult: ClientGeoData = {
            ip_hash: hashIP(ip),
            ip_source: source,
            country: geoData.country || 'Unknown',
            city: geoData.city || 'Unknown',
            isp: geoData.isp || 'Unknown',
            vpn_detected: detectVPN(geoData.isp || '', geoData.org || '', geoData.as || ''),
            tor_detected: detectTor(geoData.isp || '', geoData.org || ''),
        };

        if (debugMode) {
            clientResult.debug = {
                all_headers: allHeaders,
                selected_source: source,
                is_private: false,
                raw_ip_masked: maskIPForDebug(ip),
            };
        }

        // SECURITY: real_ip is in _server_data, NEVER in the main client response
        return res.status(200).json({
            ...clientResult,
            _server_data: {
                real_ip: realIp,  // Plain text IP for admin-only storage
            } as Partial<ServerSecurityData>
        });

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
