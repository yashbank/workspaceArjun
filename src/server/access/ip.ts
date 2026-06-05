import ipaddr from 'ipaddr.js';

/**
 * Extracts the client IP from request headers. On Vercel the original client is
 * the FIRST entry of `x-forwarded-for`; `x-real-ip` is a fallback. This only
 * reads server-set proxy headers — never client-submitted body/query input.
 */
export function extractRequestIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    const norm = first ? normalizeIp(first) : null;
    if (norm) return norm;
  }
  const real = headers.get('x-real-ip');
  if (real) {
    const norm = normalizeIp(real.trim());
    if (norm) return norm;
  }
  return null;
}

/**
 * Normalizes an IP string: strips brackets/port, unwraps IPv4-mapped IPv6
 * (`::ffff:1.2.3.4` → `1.2.3.4`), and returns a canonical form. Returns null for
 * anything that is not a valid IP address.
 */
export function normalizeIp(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  if (s.startsWith('[')) {
    // [::1] or [::1]:443 → ::1
    const end = s.indexOf(']');
    if (end !== -1) s = s.slice(1, end);
  } else if (s.includes('.') && s.lastIndexOf(':') > s.indexOf('.')) {
    // IPv4 with a trailing :port → drop the port (IPv6 contains no dots)
    s = s.slice(0, s.lastIndexOf(':'));
  }

  if (!ipaddr.isValid(s)) return null;
  let addr = ipaddr.parse(s);
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      addr = v6.toIPv4Address();
    }
  }
  // Compressed canonical form (RFC 5952 for IPv6, dotted-decimal for IPv4).
  return addr.toString();
}

/** True if `value` is a valid IPv4/IPv6 address or CIDR range. */
export function isValidIpOrCidr(value: string): boolean {
  if (!value) return false;
  try {
    if (value.includes('/')) {
      ipaddr.parseCIDR(value);
      return true;
    }
    return ipaddr.isValid(value);
  } catch {
    return false;
  }
}

/** True if `ip` falls within `range` (an exact IP or a CIDR). Same-kind only. */
export function ipMatchesRange(ip: string, range: string): boolean {
  const norm = normalizeIp(ip);
  if (!norm) return false;
  const addr = ipaddr.parse(norm);

  try {
    if (range.includes('/')) {
      const [rangeAddr, bits] = ipaddr.parseCIDR(range);
      if (addr.kind() !== rangeAddr.kind()) return false;
      if (addr.kind() === 'ipv4') {
        return (addr as ipaddr.IPv4).match([rangeAddr as ipaddr.IPv4, bits]);
      }
      return (addr as ipaddr.IPv6).match([rangeAddr as ipaddr.IPv6, bits]);
    }
    const normRange = normalizeIp(range);
    return normRange !== null && normRange === norm;
  } catch {
    return false;
  }
}

/** True if `ip` matches any of the given ranges. */
export function ipMatchesAny(ip: string | null, ranges: string[]): boolean {
  if (!ip) return false;
  return ranges.some((range) => ipMatchesRange(ip, range));
}
