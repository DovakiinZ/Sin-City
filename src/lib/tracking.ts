// ============================================================
// Client tracking helpers — first-touch attribution, extra
// fingerprint entropy (audio + fonts), and geo-mismatch detection.
// All first-party, silent-capture, no third parties.
// ============================================================

export interface FirstTouch {
    referrer: string;
    landing_page: string;
    /**
     * utm_* params (source, medium, campaign, term, content) plus two extras:
     * `ref` (from ?ref= / ?via=) and `click_id` (the NAME of an ad/share click
     * id found in the URL, e.g. "fbclid" — never its value).
     */
    utm: Record<string, string>;
    ts?: string;
}

export interface TrafficSource {
    /** Normalised origin: "twitter", "google", "newsletter", "example.com", "direct", "internal". */
    source: string;
    /** "search" | "social" | "paid" | "referral" | "ai" | "direct" | "internal" | whatever utm_medium said. */
    medium: string;
}

const FIRST_TOUCH_KEY = 'sc_first_touch';
const SESSION_TOUCH_KEY = 'sc_session_touch';

const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'];
const REF_PARAMS = ['ref', 'via'];

// Click ids that ad platforms / share sheets append to links. They survive even
// when the app that opened the link strips the referrer (most in-app browsers).
const CLICK_IDS: Record<string, TrafficSource> = {
    gclid: { source: 'google', medium: 'paid' },
    gbraid: { source: 'google', medium: 'paid' },
    wbraid: { source: 'google', medium: 'paid' },
    msclkid: { source: 'bing', medium: 'paid' },
    fbclid: { source: 'facebook', medium: 'social' },
    igshid: { source: 'instagram', medium: 'social' },
    ttclid: { source: 'tiktok', medium: 'paid' },
    twclid: { source: 'twitter', medium: 'paid' },
    li_fat_id: { source: 'linkedin', medium: 'paid' },
    sccid: { source: 'snapchat', medium: 'paid' },
};

// Referrer host (suffix match) -> source. First match wins.
const KNOWN_HOSTS: Array<[string, TrafficSource]> = [
    ['t.co', { source: 'twitter', medium: 'social' }],
    ['twitter.com', { source: 'twitter', medium: 'social' }],
    ['x.com', { source: 'twitter', medium: 'social' }],
    ['facebook.com', { source: 'facebook', medium: 'social' }],
    ['fb.com', { source: 'facebook', medium: 'social' }],
    ['fb.me', { source: 'facebook', medium: 'social' }],
    ['instagram.com', { source: 'instagram', medium: 'social' }],
    ['threads.net', { source: 'threads', medium: 'social' }],
    ['threads.com', { source: 'threads', medium: 'social' }],
    ['tiktok.com', { source: 'tiktok', medium: 'social' }],
    ['snapchat.com', { source: 'snapchat', medium: 'social' }],
    ['reddit.com', { source: 'reddit', medium: 'social' }],
    ['linkedin.com', { source: 'linkedin', medium: 'social' }],
    ['lnkd.in', { source: 'linkedin', medium: 'social' }],
    ['youtube.com', { source: 'youtube', medium: 'social' }],
    ['youtu.be', { source: 'youtube', medium: 'social' }],
    ['t.me', { source: 'telegram', medium: 'social' }],
    ['telegram.org', { source: 'telegram', medium: 'social' }],
    ['whatsapp.com', { source: 'whatsapp', medium: 'social' }],
    ['wa.me', { source: 'whatsapp', medium: 'social' }],
    ['discord.com', { source: 'discord', medium: 'social' }],
    ['discord.gg', { source: 'discord', medium: 'social' }],
    ['discordapp.com', { source: 'discord', medium: 'social' }],
    ['bsky.app', { source: 'bluesky', medium: 'social' }],
    ['github.com', { source: 'github', medium: 'referral' }],
    ['bing.com', { source: 'bing', medium: 'search' }],
    ['duckduckgo.com', { source: 'duckduckgo', medium: 'search' }],
    ['yahoo.com', { source: 'yahoo', medium: 'search' }],
    ['baidu.com', { source: 'baidu', medium: 'search' }],
    ['ecosia.org', { source: 'ecosia', medium: 'search' }],
    ['brave.com', { source: 'brave', medium: 'search' }],
    ['chatgpt.com', { source: 'chatgpt', medium: 'ai' }],
    ['openai.com', { source: 'chatgpt', medium: 'ai' }],
    ['perplexity.ai', { source: 'perplexity', medium: 'ai' }],
    ['claude.ai', { source: 'claude', medium: 'ai' }],
    ['gemini.google.com', { source: 'gemini', medium: 'ai' }],
    ['copilot.microsoft.com', { source: 'copilot', medium: 'ai' }],
];

// Android apps report themselves as android-app://<package>.
const ANDROID_APPS: Array<[string, TrafficSource]> = [
    ['com.google.android.googlequicksearchbox', { source: 'google', medium: 'search' }],
    ['com.google.android.gm', { source: 'gmail', medium: 'email' }],
    ['com.twitter.android', { source: 'twitter', medium: 'social' }],
    ['com.facebook', { source: 'facebook', medium: 'social' }],
    ['com.instagram', { source: 'instagram', medium: 'social' }],
    ['org.telegram', { source: 'telegram', medium: 'social' }],
    ['com.whatsapp', { source: 'whatsapp', medium: 'social' }],
    ['com.reddit', { source: 'reddit', medium: 'social' }],
    ['com.linkedin', { source: 'linkedin', medium: 'social' }],
    ['com.discord', { source: 'discord', medium: 'social' }],
    ['com.snapchat', { source: 'snapchat', medium: 'social' }],
    ['com.zhiliaoapp.musically', { source: 'tiktok', medium: 'social' }],
];

// What people actually type into utm_source / ?ref=.
const SOURCE_ALIASES: Record<string, string> = {
    x: 'twitter', tw: 'twitter', 'x.com': 'twitter', 't.co': 'twitter', 'twitter.com': 'twitter',
    fb: 'facebook', 'facebook.com': 'facebook', meta: 'facebook',
    ig: 'instagram', insta: 'instagram', 'instagram.com': 'instagram',
    yt: 'youtube', 'youtube.com': 'youtube',
    tg: 'telegram', wa: 'whatsapp', li: 'linkedin', 'linkedin.com': 'linkedin',
    'reddit.com': 'reddit', 'tiktok.com': 'tiktok', 'google.com': 'google',
};

const SOCIAL = new Set([
    'twitter', 'facebook', 'instagram', 'threads', 'tiktok', 'snapchat', 'reddit',
    'linkedin', 'youtube', 'telegram', 'whatsapp', 'discord', 'bluesky',
]);

function clean(v: string | null | undefined, max = 120): string {
    return (v || '').trim().slice(0, max);
}

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

function hostMatches(host: string, domain: string): boolean {
    return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Reads the attribution out of one page load. Pure — `ownHost` is the site's own
 * hostname, so a referrer from the site itself is not mistaken for a source.
 */
export function parseTouch(search: string, referrer: string, pathname: string, ownHost = ''): FirstTouch {
    const params = new URLSearchParams(search);
    const utm: Record<string, string> = {};

    for (const k of UTM_KEYS) {
        const v = clean(params.get(`utm_${k}`));
        if (v) utm[k] = v;
    }
    for (const k of REF_PARAMS) {
        const v = clean(params.get(k));
        if (v && !utm.ref) utm.ref = v;
    }
    for (const [key] of params) {
        const id = key.toLowerCase();
        if (CLICK_IDS[id]) { utm.click_id = id; break; }
    }

    const own = ownHost.toLowerCase().replace(/^www\./, '');
    const refHost = hostOf(referrer);
    const external = referrer && !(own && refHost === own);

    return {
        referrer: external ? referrer.slice(0, 500) : '',
        landing_page: (pathname + search).slice(0, 500),
        utm,
    };
}

/** Turns a stored referrer + UTM bag into one readable source / medium. */
export function classifySource(touch: { referrer?: string | null; utm?: Record<string, unknown> | null }): TrafficSource {
    const utm = (touch.utm || {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
    const alias = (s: string) => SOURCE_ALIASES[s] || s;

    // 1. An explicit utm_source is the link author's own statement — it wins.
    const utmSource = str(utm.source);
    if (utmSource) {
        const source = alias(utmSource);
        return { source, medium: str(utm.medium) || (SOCIAL.has(source) ? 'social' : 'campaign') };
    }

    // 2. ?ref= / ?via=
    const ref = str(utm.ref);
    if (ref) {
        const source = alias(ref);
        return { source, medium: str(utm.medium) || (SOCIAL.has(source) ? 'social' : 'referral') };
    }

    // 3. Click id left in the URL by an ad platform or share sheet.
    const click = CLICK_IDS[str(utm.click_id)];
    if (click) return { source: click.source, medium: str(utm.medium) || click.medium };

    // 4. The referrer the browser reported.
    const referrer = (touch.referrer || '').trim();
    if (referrer) {
        if (referrer.toLowerCase().startsWith('android-app://')) {
            const pkg = referrer.slice('android-app://'.length).split('/')[0].toLowerCase();
            const app = ANDROID_APPS.find(([prefix]) => pkg.startsWith(prefix));
            return app ? app[1] : { source: pkg || 'android-app', medium: 'app' };
        }
        const host = hostOf(referrer);
        if (host) {
            const known = KNOWN_HOSTS.find(([domain]) => hostMatches(host, domain));
            if (known) return known[1];
            // google.com, google.co.uk, google.com.sa … (after the gemini entry above)
            if (/(^|\.)google\.[a-z.]{2,6}$/.test(host)) return { source: 'google', medium: 'search' };
            if (/(^|\.)yandex\.[a-z.]{2,6}$/.test(host)) return { source: 'yandex', medium: 'search' };
            if (/(^|\.)mail\./.test(host) || host.startsWith('mail.')) return { source: host, medium: 'email' };
            return { source: host, medium: 'referral' };
        }
    }

    // 5. Nothing at all: typed URL, bookmark, or an app that strips the referrer.
    return { source: 'direct', medium: 'direct' };
}

function readTouch(storage: Storage, key: string): FirstTouch | null {
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const t = JSON.parse(raw);
        if (t && typeof t === 'object') {
            return { referrer: t.referrer || '', landing_page: t.landing_page || '', utm: t.utm || {}, ts: t.ts };
        }
    } catch { /* ignore */ }
    return null;
}

function currentTouch(): FirstTouch {
    return {
        ...parseTouch(window.location.search, document.referrer || '', window.location.pathname, window.location.hostname),
        ts: new Date().toISOString(),
    };
}

/**
 * First-touch attribution: the referrer + UTM params from the visitor's very
 * first page load, persisted so later visits don't overwrite the original source.
 */
export function getFirstTouch(): FirstTouch {
    try {
        const existing = readTouch(localStorage, FIRST_TOUCH_KEY);
        if (existing) return existing;
    } catch { /* ignore */ }

    const firstTouch = currentTouch();
    try { localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch)); } catch { /* ignore */ }
    return firstTouch;
}

/**
 * Session-touch attribution: where THIS visit came from (per tab session). Used
 * by the analytics events so "top sources" reflects current traffic, not only
 * the source of each visitor's first ever visit.
 */
export function getSessionTouch(): FirstTouch & TrafficSource {
    let touch: FirstTouch | null = null;
    try { touch = readTouch(sessionStorage, SESSION_TOUCH_KEY); } catch { /* ignore */ }

    if (!touch) {
        touch = currentTouch();
        // A new tab opened from the site itself is not a new arrival.
        const cameFromSelf = !!document.referrer && !touch.referrer;
        if (cameFromSelf && Object.keys(touch.utm).length === 0) touch.utm = { source: 'internal', medium: 'internal' };
        try { sessionStorage.setItem(SESSION_TOUCH_KEY, JSON.stringify(touch)); } catch { /* ignore */ }
    }
    return { ...touch, ...classifySource(touch) };
}

/**
 * Call once at startup, before the router can redirect and drop the query
 * string that carries the UTM params.
 */
export function captureTouch(): void {
    try {
        getFirstTouch();
        getSessionTouch();
    } catch { /* never block the app on tracking */ }
}

/**
 * Audio fingerprint via OfflineAudioContext — renders a fixed signal through a
 * compressor and hashes the output. Stable per device/browser, high entropy.
 */
export async function getAudioFingerprint(): Promise<string> {
    try {
        const Ctx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
        if (!Ctx) return '';
        const ctx = new Ctx(1, 44100, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 10000;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        osc.connect(compressor);
        compressor.connect(ctx.destination);
        osc.start(0);

        const buffer: AudioBuffer = await ctx.startRendering();
        const data = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
        return sum.toString();
    } catch {
        return '';
    }
}

const BASE_FONTS = ['monospace', 'sans-serif', 'serif'];
const TEST_FONTS = [
    'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Garamond',
    'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact', 'Tahoma', 'Consolas',
    'Roboto', 'Segoe UI', 'Helvetica Neue', 'Ubuntu', 'Cantarell', 'Noto Sans',
    'Menlo', 'Monaco', 'Cambria', 'Calibri', 'Palatino', 'Franklin Gothic Medium',
];

/**
 * Font enumeration by measuring rendered text dimensions against baseline
 * generic families — reveals which fonts are installed (device signal).
 */
export function getFontFingerprint(): string[] {
    try {
        const testString = 'mmmmmmmmmmlli';
        const testSize = '72px';
        const body = document.getElementsByTagName('body')[0];
        if (!body) return [];

        const span = document.createElement('span');
        span.style.position = 'absolute';
        span.style.left = '-9999px';
        span.style.fontSize = testSize;
        span.textContent = testString;

        const defaults: Record<string, { w: number; h: number }> = {};
        for (const base of BASE_FONTS) {
            span.style.fontFamily = base;
            body.appendChild(span);
            defaults[base] = { w: span.offsetWidth, h: span.offsetHeight };
            body.removeChild(span);
        }

        const detected: string[] = [];
        for (const font of TEST_FONTS) {
            let matched = false;
            for (const base of BASE_FONTS) {
                span.style.fontFamily = `'${font}',${base}`;
                body.appendChild(span);
                const w = span.offsetWidth;
                const h = span.offsetHeight;
                body.removeChild(span);
                if (w !== defaults[base].w || h !== defaults[base].h) { matched = true; break; }
            }
            if (matched) detected.push(font);
        }
        return detected;
    } catch {
        return [];
    }
}

/**
 * Continent-level timezone mismatch between the browser and the IP's timezone.
 * Region-level comparison (America vs Europe …) keeps false positives low while
 * still catching most VPN/proxy usage.
 */
export function computeGeoMismatch(browserTz?: string | null, ipTz?: string | null): boolean {
    if (!browserTz || !ipTz) return false;
    const region = (tz: string) => (tz.split('/')[0] || '').toLowerCase();
    return region(browserTz) !== region(ipTz);
}
