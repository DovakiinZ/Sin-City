// ============================================================
// Client tracking helpers — first-touch attribution, extra
// fingerprint entropy (audio + fonts), and geo-mismatch detection.
// All first-party, silent-capture, no third parties.
// ============================================================

export interface FirstTouch {
    referrer: string;
    landing_page: string;
    utm: Record<string, string>;
}

const FIRST_TOUCH_KEY = 'sc_first_touch';

/**
 * First-touch attribution: the referrer + UTM params from the visitor's very
 * first page load, persisted so later visits don't overwrite the original source.
 */
export function getFirstTouch(): FirstTouch {
    try {
        const existing = localStorage.getItem(FIRST_TOUCH_KEY);
        if (existing) return JSON.parse(existing) as FirstTouch;
    } catch { /* ignore */ }

    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    ['source', 'medium', 'campaign', 'term', 'content'].forEach((k) => {
        const v = params.get(`utm_${k}`);
        if (v) utm[k] = v;
    });

    const firstTouch: FirstTouch = {
        referrer: document.referrer || '',
        landing_page: window.location.pathname + window.location.search,
        utm,
    };

    try { localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch)); } catch { /* ignore */ }
    return firstTouch;
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
