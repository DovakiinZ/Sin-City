import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';

// ============================================================
// EMAIL INTELLIGENCE
// Given an email, returns (all free, no keys):
//   - valid        : basic RFC-ish format check
//   - disposable   : domain is a known throwaway-mail provider
//   - mx_valid     : the domain actually has MX records (can receive mail)
//   - gravatar_hash: SHA-256 of the normalized email (for avatar/profile URLs)
//   - has_gravatar : the email has a public Gravatar image
//   - name         : public Gravatar display name, if any
// ============================================================

// Compact list of common disposable / throwaway email domains.
const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
    'sharklasers.com', 'grr.la', 'guerrillamailblock.com', '10minutemail.com',
    '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmailo.com',
    'tempail.com', 'throwawaymail.com', 'getnada.com', 'nada.email', 'dispostable.com',
    'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com', 'trashmail.de',
    'mailnesia.com', 'maildrop.cc', 'mailcatch.com', 'mohmal.com', 'fakeinbox.com',
    'spamgourmet.com', 'mytemp.email', 'moakt.com', 'tempinbox.com', 'emailondeck.com',
    'inboxkitten.com', 'burnermail.io', '33mail.com', 'anonaddy.com', 'anonaddy.me',
    'mailsac.com', 'harakirimail.com', 'discard.email', 'spam4.me', 'temp-mail.io',
    'tempmail.plus', 'tmpmail.org', 'tmpmail.net', 'linshiyouxiang.net', 'mailtemp.info',
    '1secmail.com', '1secmail.org', '1secmail.net', 'esiix.com', 'wwjmp.com',
    'byom.de', 'einrot.com', 'jetable.org', 'mailexpire.com', 'mint.email',
    'tempmailaddress.com', 'fakemailgenerator.com', 'mailde.de', 'nowmymail.com',
    'throwam.com', 'trbvm.com', 'vomoto.com', 'zetmail.com', 'cool.fr.nf',
    'emailtemporario.com.br', 'incognitomail.org', 'kurzepost.de', 'objectmail.com',
    'proxymail.eu', 'rcpt.at', 'trash-mail.at', 'wegwerfmail.de', 'wegwerfmail.net',
]);

function normalizeEmail(email: string): string {
    return String(email || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
    // Pragmatic RFC-ish check; not exhaustive but rejects obvious junk.
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

async function hasMxRecords(domain: string): Promise<boolean> {
    try {
        const records = await dns.resolveMx(domain);
        if (records && records.length > 0) return true;
    } catch { /* no MX */ }
    // Some domains accept mail on the A record (implicit MX)
    try {
        const a = await dns.resolve(domain);
        return Array.isArray(a) && a.length > 0;
    } catch {
        return false;
    }
}

async function lookupGravatar(hash: string): Promise<{ has: boolean; name: string | null }> {
    const result = { has: false, name: null as string | null };
    // Existence: d=404 makes Gravatar return 404 when no custom image exists
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`https://www.gravatar.com/avatar/${hash}?d=404`, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(tid);
        result.has = res.status === 200;
    } catch { /* ignore */ }
    // Public profile (display name), if the user has one
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`https://www.gravatar.com/${hash}.json`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
            const data: any = await res.json();
            const entry = data?.entry?.[0];
            if (entry) {
                result.has = true;
                result.name = entry.displayName || entry.name?.formatted || null;
            }
        }
    } catch { /* ignore */ }
    return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

    try {
        const body = req.body || {};
        const email = normalizeEmail(body.email);

        if (!isValidEmail(email)) {
            return res.status(200).json({
                valid: false, disposable: false, mx_valid: false,
                gravatar_hash: null, has_gravatar: false, name: null,
            });
        }

        const domain = email.split('@')[1];
        const gravatarHash = sha256(email);

        const [mxValid, gravatar] = await Promise.all([
            hasMxRecords(domain),
            lookupGravatar(gravatarHash),
        ]);

        return res.status(200).json({
            valid: true,
            disposable: DISPOSABLE_DOMAINS.has(domain),
            mx_valid: mxValid,
            gravatar_hash: gravatarHash,
            has_gravatar: gravatar.has,
            name: gravatar.name,
        });
    } catch (error) {
        console.error('[email-check] Error:', error);
        return res.status(500).json({ error: 'Email check failed' });
    }
}
