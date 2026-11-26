// lib/network.ts — shared geo lookup + VPN/proxy/Tor classification for the API functions.
// Lives in the root lib/ (not api/) so it does not count as a Vercel function.

export interface GeoResult {
    country: string; country_code: string; city: string; region: string; postal: string;
    latitude: number | null; longitude: number | null; timezone: string; continent: string;
    isp: string; org: string; asn: string; isp_domain: string;
    is_eu: boolean; proxy: boolean; hosting: boolean; mobile: boolean;
    providers: string[];
}

export interface NetworkProfile extends GeoResult {
    vpn_detected: boolean;
    tor_detected: boolean;
    /** Why the connection was flagged (null when clean). */
    vpn_reason: string | null;
}

type Headers = Record<string, string | string[] | undefined>;

function getHeader(headers: Headers, key: string): string | undefined {
    const v = headers[key];
    return Array.isArray(v) ? v[0] : v;
}

// ============================================================
// VPN / PROXY / TOR CLASSIFICATION
// ============================================================

// Datacenter / VPN-provider networks. A residential or mobile visitor is never
// announced from these, so traffic from them is a VPN, proxy or server.
const VPN_ASNS = new Set([
    'AS9009',   // M247 (NordVPN, Surfshark, many others)
    'AS16509', 'AS14618', // Amazon AWS
    'AS15169', 'AS396982', // Google Cloud
    'AS8075',   // Microsoft Azure
    'AS13335',  // Cloudflare (WARP)
    'AS20473',  // Vultr / Choopa
    'AS14061',  // DigitalOcean
    'AS63949',  // Linode / Akamai Connected Cloud
    'AS209854', // Surfshark
    'AS212238', // Datacamp (CDN77 — ProtonVPN, NordVPN...)
    'AS60068',  // Datacamp / CDN77
    'AS136787', // PacketHub (NordVPN)
    'AS147049', // PacketHub
    'AS39351',  // 31173 Services (Mullvad)
    'AS62240',  // Clouvider
    'AS16276',  // OVH
    'AS24940',  // Hetzner
    'AS51167',  // Contabo
    'AS12876',  // Scaleway
    'AS60781', 'AS28753', // Leaseweb
    'AS31898',  // Oracle Cloud
    'AS45102',  // Alibaba Cloud
    'AS36352',  // ColoCrossing
    'AS46562',  // Performive
    'AS53667',  // FranTech (BuyVM)
    'AS202425', // IP Volume
    'AS206092', // SecFirewall / IPXO VPN ranges
]);

// "vpn" has no word boundary on purpose (NordVPN, ExpressVPN, PureVPN...).
const VPN_NAME = /vpn|\b(proxy|proxies|mullvad|surfshark|proton ag|cyberghost|windscribe|tunnelbear|private internet access|hotspot shield|hide\.me|packethub|tefincom|datacamp|cdn77|m247|clouvider)\b/i;
const HOSTING_NAME = /\b(hosting|datacenter|data ?center|colocation|vps|dedicated servers?|digitalocean|linode|vultr|choopa|hetzner|ovh|contabo|scaleway|leaseweb)\b/i;
// Word-bounded: a bare "tor" substring also matches Operator, Vector, Storage...
const TOR_NAME = /\btor\b|tor[- ]?exit|torservers|tor project/i;

/**
 * Decide whether a connection is a VPN / proxy / Tor exit.
 *
 * The result gates access to the site, so a false positive locks out a real
 * visitor. Two rules follow from that:
 *  - ip-api's "hosting" flag is NOT used on its own: it marks ordinary home
 *    broadband ranges (e.g. STC residential) as hosting.
 *  - When the proxycheck.io database answered (proxyDb), it is authoritative
 *    over ip-api's "proxy" flag in both directions.
 * ASN and provider-name matches are independent evidence and always count.
 */
export function classifyNetwork(n: {
    isp?: string; org?: string; asn?: string; proxy?: boolean; hosting?: boolean;
    /** proxycheck.io verdict: 'yes' | 'no', or null when it was not consulted. */
    proxyDb?: 'yes' | 'no' | null;
    proxyType?: string | null;
}): { vpn_detected: boolean; tor_detected: boolean; vpn_reason: string | null } {
    const names = `${n.isp || ''} ${n.org || ''}`;
    const asn = (n.asn || '').toUpperCase().split(' ')[0];
    const type = (n.proxyType || '').toUpperCase();
    const dbYes = n.proxyDb === 'yes';

    const tor = (dbYes && type === 'TOR') || TOR_NAME.test(names);

    let reason: string | null = null;
    if (tor) reason = 'tor';
    else if (dbYes) reason = `proxy_db:${(type || 'proxy').toLowerCase()}`;
    else if (n.proxy && n.proxyDb !== 'no') reason = 'proxy_flag';
    else if (asn && VPN_ASNS.has(asn)) reason = `asn:${asn}`;
    else if (VPN_NAME.test(names)) reason = 'vpn_provider';
    else if (HOSTING_NAME.test(names)) reason = 'datacenter_name';

    return { vpn_detected: reason !== null, tor_detected: tor, vpn_reason: reason };
}

// ============================================================
// GEO LOOKUP (free, keyless, merged)
//   - Vercel edge headers (x-vercel-ip-*): country/city on every request
//   - ip-api.com -> proxy / hosting / mobile flags + ISP/ASN (HTTP, 45 req/min)
//   - ipwho.is   -> postal, ASN org, ISP domain, is_eu (HTTPS)
//   - proxycheck.io (optional, only when PROXYCHECK_API_KEY is set) -> VPN database
// A provider being down or rate-limited still yields data from the others.
// ============================================================
function getVercelGeo(headers: Headers) {
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

// Per-instance cache: the same visitor hits several endpoints on one page load,
// and ip-api.com rate-limits at 45 req/min.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: NetworkProfile }>();

export async function lookupNetwork(ip: string, headers: Headers): Promise<NetworkProfile> {
    const hit = cache.get(ip);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const v = getVercelGeo(headers);
    const pick = (...vals: any[]) => vals.find(x => x !== undefined && x !== null && x !== '');
    const num = (x: any) => { const n = typeof x === 'number' ? x : parseFloat(x); return Number.isFinite(n) ? n : null; };

    const IPAPI_FIELDS = 'status,message,continent,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting';
    const pcKey = process.env.PROXYCHECK_API_KEY;
    const enc = encodeURIComponent(ip);
    const [ipapi, ipwho, pcheck] = await Promise.all([
        fetchJSON(`http://ip-api.com/json/${enc}?fields=${IPAPI_FIELDS}`, 4000),
        fetchJSON(`https://ipwho.is/${enc}`, 4000),
        pcKey ? fetchJSON(`https://proxycheck.io/v2/${enc}?key=${encodeURIComponent(pcKey)}&vpn=1&asn=1`, 4000) : Promise.resolve(null),
    ]);

    const a = ipapi && ipapi.status === 'success' ? ipapi : null;
    const b = ipwho && ipwho.success !== false ? ipwho : null;
    const c = pcheck && pcheck.status === 'ok' && pcheck[ip] ? pcheck[ip] : null;
    const bc = (b && b.connection) || {};
    const providers: string[] = [];
    if (a) providers.push('ip-api');
    if (b) providers.push('ipwho');
    if (c) providers.push('proxycheck');

    const asn = a?.as ? String(a.as).split(' ')[0] : (bc.asn ? `AS${bc.asn}` : (c?.asn || ''));
    const pcProxy = c?.proxy === 'yes';

    const geo: GeoResult = {
        country: pick(a?.country, b?.country, c?.country, v.country, 'Unknown'),
        country_code: pick(a?.countryCode, b?.country_code, c?.isocode, ''),
        city: pick(a?.city, b?.city, c?.city, v.city, 'Unknown'),
        region: pick(a?.regionName, b?.region, c?.region, v.region, ''),
        postal: pick(a?.zip, b?.postal, ''),
        latitude: num(pick(a?.lat, b?.latitude, v.latitude)),
        longitude: num(pick(a?.lon, b?.longitude, v.longitude)),
        timezone: pick(a?.timezone, b?.timezone?.id, v.timezone, ''),
        continent: pick(a?.continent, b?.continent, ''),
        isp: pick(a?.isp, bc.isp, bc.org, a?.org, c?.provider, 'Unknown'),
        org: pick(a?.org, bc.org, a?.isp, bc.isp, c?.provider, 'Unknown'),
        asn: asn || '',
        isp_domain: pick(bc.domain, ''),
        is_eu: Boolean(b?.is_eu),
        proxy: Boolean(a?.proxy) || pcProxy,
        hosting: Boolean(a?.hosting),
        mobile: Boolean(a?.mobile),
        providers,
    };

    const value: NetworkProfile = {
        ...geo,
        ...classifyNetwork({
            isp: geo.isp, org: geo.org, asn: geo.asn,
            proxy: Boolean(a?.proxy), hosting: geo.hosting,
            proxyDb: c ? (pcProxy ? 'yes' : 'no') : null,
            proxyType: pcProxy ? String(c?.type || 'proxy') : null,
        }),
    };

    // Only cache real answers, so a provider outage is retried on the next request.
    if (providers.length > 0) {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(ip, { at: Date.now(), value });
    }
    return value;
}

/** The network_info JSON persisted on guests / profiles. */
export function toNetworkInfo(n: NetworkProfile) {
    return {
        country: n.country, country_code: n.country_code, city: n.city,
        region: n.region, postal: n.postal,
        latitude: n.latitude, longitude: n.longitude,
        timezone: n.timezone, continent: n.continent,
        isp: n.isp, org: n.org, asn: n.asn, isp_domain: n.isp_domain,
        is_eu: n.is_eu, proxy: n.proxy, hosting: n.hosting, mobile: n.mobile,
        vpn_detected: n.vpn_detected, tor_detected: n.tor_detected, vpn_reason: n.vpn_reason,
        providers: n.providers,
    };
}
