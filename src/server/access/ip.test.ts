import { describe, it, expect } from 'vitest';
import {
  normalizeIp,
  isValidIpOrCidr,
  ipMatchesRange,
  ipMatchesAny,
  extractRequestIp,
} from './ip';

describe('normalizeIp', () => {
  it('keeps a plain IPv4 address', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it('strips a trailing port from IPv4', () => {
    expect(normalizeIp('203.0.113.7:55123')).toBe('203.0.113.7');
  });

  it('unwraps IPv4-mapped IPv6', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('normalizes IPv6 and handles brackets/port', () => {
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(normalizeIp('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
  });

  it('returns null for invalid input', () => {
    expect(normalizeIp('not-an-ip')).toBeNull();
    expect(normalizeIp('999.999.999.999')).toBeNull();
    expect(normalizeIp('')).toBeNull();
  });
});

describe('isValidIpOrCidr', () => {
  it('accepts IPv4, IPv6, and CIDR', () => {
    expect(isValidIpOrCidr('203.0.113.7')).toBe(true);
    expect(isValidIpOrCidr('203.0.113.0/24')).toBe(true);
    expect(isValidIpOrCidr('2001:db8::/32')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isValidIpOrCidr('203.0.113.0/99')).toBe(false);
    expect(isValidIpOrCidr('hello')).toBe(false);
    expect(isValidIpOrCidr('')).toBe(false);
  });
});

describe('ipMatchesRange', () => {
  it('matches an exact IPv4', () => {
    expect(ipMatchesRange('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(ipMatchesRange('203.0.113.8', '203.0.113.7')).toBe(false);
  });

  it('matches inside an IPv4 CIDR', () => {
    expect(ipMatchesRange('203.0.113.42', '203.0.113.0/24')).toBe(true);
    expect(ipMatchesRange('203.0.114.1', '203.0.113.0/24')).toBe(false);
  });

  it('matches an exact IPv6 and inside an IPv6 CIDR', () => {
    expect(ipMatchesRange('2001:db8::1', '2001:db8::1')).toBe(true);
    expect(ipMatchesRange('2001:db8:0:0:0:0:0:abcd', '2001:db8::/32')).toBe(true);
    expect(ipMatchesRange('2001:dead::1', '2001:db8::/32')).toBe(false);
  });

  it('does not cross-match IPv4 vs IPv6', () => {
    expect(ipMatchesRange('203.0.113.7', '2001:db8::/32')).toBe(false);
    expect(ipMatchesRange('2001:db8::1', '203.0.113.0/24')).toBe(false);
  });

  it('returns false for invalid ip or range', () => {
    expect(ipMatchesRange('nope', '203.0.113.0/24')).toBe(false);
    expect(ipMatchesRange('203.0.113.7', 'nope')).toBe(false);
    expect(ipMatchesRange('203.0.113.7', '203.0.113.0/99')).toBe(false);
  });

  it('matches IPv4-mapped IPv6 against an IPv4 range', () => {
    expect(ipMatchesRange('::ffff:203.0.113.42', '203.0.113.0/24')).toBe(true);
  });
});

describe('ipMatchesAny', () => {
  it('matches if any range matches; false for null ip', () => {
    expect(ipMatchesAny('203.0.113.7', ['10.0.0.0/8', '203.0.113.0/24'])).toBe(true);
    expect(ipMatchesAny('8.8.8.8', ['10.0.0.0/8', '203.0.113.0/24'])).toBe(false);
    expect(ipMatchesAny(null, ['203.0.113.0/24'])).toBe(false);
  });
});

describe('extractRequestIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });
    expect(extractRequestIp(h)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '198.51.100.9' });
    expect(extractRequestIp(h)).toBe('198.51.100.9');
  });

  it('returns null when no usable header is present', () => {
    expect(extractRequestIp(new Headers())).toBeNull();
    expect(extractRequestIp(new Headers({ 'x-forwarded-for': 'garbage' }))).toBeNull();
  });
});
