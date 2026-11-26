import { describe, it, expect } from 'vitest';
import { classifyNetwork } from '../lib/network';
import { getClientIP, isPrivateIP, isValidIP, normalizeIP } from '../api/lib/ip-utils';

describe('classifyNetwork', () => {
  it('does not flag residential / mobile ISPs', () => {
    for (const isp of [
      'Saudi Telecom Company JSC',
      'Etihad Etisalat, a joint stock company',
      'Mobile Telecommunication Company Saudi Arabia Joint-Stock company',
      'Vodafone Network Operator',   // "tor" inside Operator
      'Vector Communications',       // "tor" inside Vector
      'Comcast Cable Communications',
    ]) {
      expect(classifyNetwork({ isp, org: isp, asn: 'AS25019' }), isp).toEqual({
        vpn_detected: false, tor_detected: false, vpn_reason: null,
      });
    }
  });

  it('flags provider proxy / hosting flags', () => {
    expect(classifyNetwork({ isp: 'Some ISP', proxy: true }).vpn_reason).toBe('proxy_flag');
    expect(classifyNetwork({ isp: 'Some ISP', hosting: true }).vpn_reason).toBe('datacenter_flag');
  });

  it('flags known VPN / datacenter networks by ASN and name', () => {
    expect(classifyNetwork({ isp: 'M247 Europe SRL', asn: 'AS9009 M247 Europe SRL' }).vpn_detected).toBe(true);
    expect(classifyNetwork({ isp: 'NordVPN', asn: 'AS1' }).vpn_reason).toBe('vpn_provider');
    expect(classifyNetwork({ isp: 'Acme Hosting Ltd', asn: 'AS1' }).vpn_reason).toBe('datacenter_name');
    expect(classifyNetwork({ isp: 'DigitalOcean, LLC', asn: 'AS14061' }).vpn_detected).toBe(true);
  });

  it('flags Tor only on a real Tor signal', () => {
    expect(classifyNetwork({ isp: 'Tor Exit Node', asn: 'AS1' })).toMatchObject({ tor_detected: true, vpn_detected: true, vpn_reason: 'tor' });
    expect(classifyNetwork({ isp: 'x', proxyType: 'TOR' }).tor_detected).toBe(true);
    expect(classifyNetwork({ isp: 'x', proxyType: 'VPN' })).toMatchObject({ tor_detected: false, vpn_reason: 'proxy_db:vpn' });
  });
});

describe('ip-utils', () => {
  it('normalizes mapped, bracketed and ported addresses', () => {
    expect(normalizeIP('::ffff:8.8.8.8')).toBe('8.8.8.8');
    expect(normalizeIP('[2001:DB8::1]:443')).toBe('2001:db8::1');
    expect(normalizeIP(' 8.8.8.8:5050 ')).toBe('8.8.8.8');
    expect(normalizeIP(undefined)).toBe('unknown');
  });

  it('validates and classifies addresses', () => {
    expect(isValidIP('8.8.8.8')).toBe(true);
    expect(isValidIP('2a02:cb80:4000::1')).toBe(true);
    expect(isValidIP('999.1.1.1')).toBe(false);
    expect(isValidIP('not-an-ip')).toBe(false);
    expect(isPrivateIP('192.168.1.5')).toBe(true);
    expect(isPrivateIP('fd12:3456::1')).toBe(true);
    expect(isPrivateIP('fe80::1')).toBe(true);
    expect(isPrivateIP('8.8.8.8')).toBe(false);
  });

  it('prefers the platform-set header over client-controllable ones', () => {
    const r = getClientIP({
      headers: {
        'x-vercel-forwarded-for': '94.96.1.2',
        'x-real-ip': '94.96.1.2',
        'x-forwarded-for': '94.96.1.2',
        'cf-connecting-ip': '1.1.1.1',   // spoofed by the client
        'true-client-ip': '2.2.2.2',     // spoofed by the client
      },
    });
    expect(r.ip).toBe('94.96.1.2');
    expect(r.source).toBe('vercel');
    expect(r.realIp).toBe('94.96.1.2');
  });

  it('falls back through x-real-ip and reports private addresses as non-recordable', () => {
    expect(getClientIP({ headers: { 'x-real-ip': '2a02:cb80:4000::1' } })).toMatchObject({ ip: '2a02:cb80:4000::1', source: 'real' });
    const local = getClientIP({ headers: {}, socket: { remoteAddress: '::ffff:127.0.0.1' } });
    expect(local).toMatchObject({ ip: '127.0.0.1', isPrivate: true, realIp: null });
  });
});
