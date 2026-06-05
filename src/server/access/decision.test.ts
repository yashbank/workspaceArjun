import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserProfile } from '@/generated/prisma/client';
import { hashDeviceToken, DEVICE_COOKIE_NAME } from './device';

const mockHeaders = vi.fn();
const mockCookies = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
  cookies: () => mockCookies(),
}));

const mockAllowedFindMany = vi.fn();
const mockDeviceFindMany = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    allowedIpRange: { findMany: (...a: unknown[]) => mockAllowedFindMany(...a) },
    approvedDevice: { findMany: (...a: unknown[]) => mockDeviceFindMany(...a) },
  },
}));

const mockLog = vi.fn();
vi.mock('@/server/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockLog(...a) }));

import { resolveAccessDecision, logAccessDenial } from './decision';

function setRequest(opts: { ip?: string; device?: string } = {}) {
  const h = new Headers({ 'user-agent': 'Mozilla/5.0 Test' });
  if (opts.ip) h.set('x-forwarded-for', opts.ip);
  mockHeaders.mockResolvedValue(h);
  mockCookies.mockResolvedValue({
    get: (name: string) =>
      opts.device && name === DEVICE_COOKIE_NAME ? { value: opts.device } : undefined,
  });
}

const profile = (over: Partial<UserProfile>) =>
  ({ id: 'u1', role: 'member', accessMode: 'ip', ...over }) as UserProfile;

beforeEach(() => {
  vi.clearAllMocks();
  setRequest();
  mockAllowedFindMany.mockResolvedValue([]);
  mockDeviceFindMany.mockResolvedValue([]);
});

describe('resolveAccessDecision', () => {
  it('bypasses owner/admin without hitting the DB', async () => {
    setRequest({ ip: '8.8.8.8' });
    const d = await resolveAccessDecision(profile({ role: 'owner', accessMode: 'ip_and_device' }));
    expect(d.allowed).toBe(true);
    expect(d.wouldBlock).toBe(false);
    expect(mockAllowedFindMany).not.toHaveBeenCalled();
    expect(mockDeviceFindMany).not.toHaveBeenCalled();
  });

  it('bypasses an unrestricted member', async () => {
    const d = await resolveAccessDecision(profile({ accessMode: 'unrestricted' }));
    expect(d.allowed).toBe(true);
  });

  it('allows an ip-mode member whose IP is in an allowed range', async () => {
    setRequest({ ip: '203.0.113.7' });
    mockAllowedFindMany.mockResolvedValue([{ value: '203.0.113.0/24' }]);
    const d = await resolveAccessDecision(profile({ accessMode: 'ip' }));
    expect(d.allowed).toBe(true);
    expect(d.ip).toBe('203.0.113.7');
  });

  it('would block an ip-mode member off the allowed range', async () => {
    setRequest({ ip: '8.8.8.8' });
    mockAllowedFindMany.mockResolvedValue([{ value: '203.0.113.0/24' }]);
    const d = await resolveAccessDecision(profile({ accessMode: 'ip' }));
    expect(d.allowed).toBe(false);
    expect(d.wouldBlock).toBe(true);
  });

  it('allows a device-mode member with a valid approved device cookie', async () => {
    setRequest({ device: 'tok-123' });
    mockDeviceFindMany.mockResolvedValue([
      { tokenHash: hashDeviceToken('tok-123'), status: 'approved' },
    ]);
    const d = await resolveAccessDecision(profile({ accessMode: 'device' }));
    expect(d.allowed).toBe(true);
    expect(d.deviceStatus).toBe('approved');
  });

  it('would block a device-mode member whose device is only pending', async () => {
    setRequest({ device: 'tok-123' });
    mockDeviceFindMany.mockResolvedValue([
      { tokenHash: hashDeviceToken('tok-123'), status: 'pending' },
    ]);
    const d = await resolveAccessDecision(profile({ accessMode: 'device' }));
    expect(d.allowed).toBe(false);
    expect(d.deviceStatus).toBe('pending');
  });

  it('ip_and_device: IP allowed but no device → would block', async () => {
    setRequest({ ip: '203.0.113.7' });
    mockAllowedFindMany.mockResolvedValue([{ value: '203.0.113.0/24' }]);
    const d = await resolveAccessDecision(profile({ accessMode: 'ip_and_device' }));
    expect(d.allowed).toBe(false);
    expect(d.wouldBlock).toBe(true);
    expect(d.deviceStatus).toBe('none');
  });
});

describe('logAccessDenial (throttled, log-only)', () => {
  const decision = {
    allowed: false,
    wouldBlock: true,
    reason: 'mode=ip;ip=false;device=none',
    ip: '8.8.8.8',
    userAgent: 'UA',
    deviceStatus: 'none' as const,
  };

  it('logs an access.denied event the first time, throttles the second', async () => {
    const p = profile({ id: 'throttle-user' });
    await logAccessDenial(p, decision);
    await logAccessDenial(p, decision);
    expect(mockLog).toHaveBeenCalledTimes(1);
    const arg = mockLog.mock.calls[0][0];
    expect(arg.action).toBe('access.denied');
    expect(arg.ip).toBe('8.8.8.8');
    expect(arg.meta.enforced).toBe(false);
  });
});
