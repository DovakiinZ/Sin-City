import { describe, it, expect } from 'vitest';
import { classifySource, parseTouch } from '../src/lib/tracking';

const OWN = 'sincity.example';

describe('parseTouch', () => {
  it('reads utm params and keeps the landing page', () => {
    const t = parseTouch('?utm_source=Newsletter&utm_medium=email&utm_campaign=launch', '', '/post/abc', OWN);
    expect(t.utm).toEqual({ source: 'Newsletter', medium: 'email', campaign: 'launch' });
    expect(t.landing_page).toBe('/post/abc?utm_source=Newsletter&utm_medium=email&utm_campaign=launch');
    expect(t.referrer).toBe('');
  });

  it('picks up ?ref= and ?via=', () => {
    expect(parseTouch('?ref=producthunt', '', '/', OWN).utm).toEqual({ ref: 'producthunt' });
    expect(parseTouch('?via=ali', '', '/', OWN).utm).toEqual({ ref: 'ali' });
  });

  it('stores the name of a click id, never its value', () => {
    const t = parseTouch('?fbclid=IwAR0secretvalue', '', '/', OWN);
    expect(t.utm).toEqual({ click_id: 'fbclid' });
  });

  it('drops a referrer that is the site itself', () => {
    expect(parseTouch('', `https://${OWN}/posts`, '/', OWN).referrer).toBe('');
    expect(parseTouch('', `https://www.${OWN}/posts`, '/', OWN).referrer).toBe('');
    expect(parseTouch('', 'https://t.co/abc', '/', OWN).referrer).toBe('https://t.co/abc');
  });
});

describe('classifySource', () => {
  it('is direct when nothing is known', () => {
    expect(classifySource({ referrer: '', utm: {} })).toEqual({ source: 'direct', medium: 'direct' });
    expect(classifySource({ referrer: null, utm: null })).toEqual({ source: 'direct', medium: 'direct' });
  });

  it('prefers utm_source over the referrer and normalises aliases', () => {
    expect(classifySource({ referrer: 'https://www.google.com/', utm: { source: 'X', medium: 'bio' } }))
      .toEqual({ source: 'twitter', medium: 'bio' });
    expect(classifySource({ utm: { source: 'ig' } })).toEqual({ source: 'instagram', medium: 'social' });
    expect(classifySource({ utm: { source: 'newsletter' } })).toEqual({ source: 'newsletter', medium: 'campaign' });
  });

  it('uses ?ref= and click ids when there is no utm_source', () => {
    expect(classifySource({ utm: { ref: 'producthunt' } })).toEqual({ source: 'producthunt', medium: 'referral' });
    expect(classifySource({ utm: { click_id: 'fbclid' } })).toEqual({ source: 'facebook', medium: 'social' });
    expect(classifySource({ utm: { click_id: 'gclid' } })).toEqual({ source: 'google', medium: 'paid' });
  });

  it('recognises well-known referrers', () => {
    const cases: Array<[string, string, string]> = [
      ['https://t.co/abc123', 'twitter', 'social'],
      ['https://x.com/someone/status/1', 'twitter', 'social'],
      ['https://l.facebook.com/l.php?u=x', 'facebook', 'social'],
      ['https://l.instagram.com/', 'instagram', 'social'],
      ['https://www.google.com/', 'google', 'search'],
      ['https://www.google.com.sa/', 'google', 'search'],
      ['https://www.google.co.uk/search?q=x', 'google', 'search'],
      ['https://gemini.google.com/app', 'gemini', 'ai'],
      ['https://duckduckgo.com/', 'duckduckgo', 'search'],
      ['https://old.reddit.com/r/x', 'reddit', 'social'],
      ['https://chatgpt.com/', 'chatgpt', 'ai'],
      ['https://web.telegram.org/', 'telegram', 'social'],
      ['android-app://com.google.android.googlequicksearchbox/', 'google', 'search'],
      ['android-app://org.telegram.messenger/', 'telegram', 'social'],
    ];
    for (const [referrer, source, medium] of cases) {
      expect(classifySource({ referrer, utm: {} }), referrer).toEqual({ source, medium });
    }
  });

  it('does not confuse look-alike hosts', () => {
    expect(classifySource({ referrer: 'https://notx.com/' })).toEqual({ source: 'notx.com', medium: 'referral' });
    expect(classifySource({ referrer: 'https://about.co/' })).toEqual({ source: 'about.co', medium: 'referral' });
    expect(classifySource({ referrer: 'https://google.evil.example/' }).source).toBe('google.evil.example');
  });

  it('falls back to the bare host for unknown sites', () => {
    expect(classifySource({ referrer: 'https://www.some-blog.dev/post/1' }))
      .toEqual({ source: 'some-blog.dev', medium: 'referral' });
  });
});
