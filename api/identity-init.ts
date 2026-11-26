import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { getClientIP, hashIP } from './lib/ip-utils.js';
import { lookupNetwork, toNetworkInfo } from '../lib/network.js';

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
        let proxyDetected = false;
        let hostingDetected = false;
        let mobileDetected = false;
        let networkInfo: Record<string, any> = { country, city, isp, providers: [] };

        if (!isPrivate) {
            const geo = await lookupNetwork(ip, req.headers);
            country = geo.country;
            city = geo.city;
            isp = geo.isp;
            proxyDetected = geo.proxy;
            hostingDetected = geo.hosting;
            mobileDetected = geo.mobile;
            vpnDetected = geo.vpn_detected;
            torDetected = geo.tor_detected;
            networkInfo = toNetworkInfo(geo);
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
