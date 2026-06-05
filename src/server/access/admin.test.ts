import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserFindMany = vi.fn();
const mockIpCreate = vi.fn();
const mockIpFindUnique = vi.fn();
const mockIpDelete = vi.fn();
const mockIpFindMany = vi.fn();
const mockDeviceFindMany = vi.fn();
const mockAuditFindMany = vi.fn();
const mockLog = vi.fn();
const mockRequirePermission = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    userProfile: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      update: (...a: unknown[]) => mockUserUpdate(...a),
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
    },
    allowedIpRange: {
      create: (...a: unknown[]) => mockIpCreate(...a),
      findUnique: (...a: unknown[]) => mockIpFindUnique(...a),
      delete: (...a: unknown[]) => mockIpDelete(...a),
      findMany: (...a: unknown[]) => mockIpFindMany(...a),
    },
    approvedDevice: { findMany: (...a: unknown[]) => mockDeviceFindMany(...a) },
    auditEvent: { findMany: (...a: unknown[]) => mockAuditFindMany(...a) },
  },
}));
vi.mock('@/server/rbac', () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));
vi.mock('@/server/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockLog(...a) }));

import {
  setUserAccessMode,
  addAllowedIpRange,
  removeAllowedIpRange,
  listAccessOverview,
  isValidAccessMode,
} from './admin';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue({ id: 'actor-1', role: 'owner', email: 'o@e.com' });
});

describe('isValidAccessMode', () => {
  it('accepts the five modes and rejects others', () => {
    for (const m of ['unrestricted', 'ip', 'device', 'ip_and_device', 'ip_or_device']) {
      expect(isValidAccessMode(m)).toBe(true);
    }
    expect(isValidAccessMode('nope')).toBe(false);
    expect(isValidAccessMode('')).toBe(false);
  });
});

describe('setUserAccessMode', () => {
  it('updates a member and audits the change', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'u1',
      role: 'member',
      accessMode: 'unrestricted',
      email: 'm@e.com',
    });
    mockUserUpdate.mockResolvedValue({ id: 'u1', accessMode: 'ip' });

    await setUserAccessMode('u1', 'ip');

    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { accessMode: 'ip' } });
    expect(mockLog.mock.calls[0][0].action).toBe('user.access_mode_change');
  });

  it('rejects restricting an owner and does not update', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'o1', role: 'owner', accessMode: 'unrestricted' });
    await expect(setUserAccessMode('o1', 'ip')).rejects.toThrow(/always bypass/i);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('rejects restricting an admin', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'a1', role: 'admin', accessMode: 'unrestricted' });
    await expect(setUserAccessMode('a1', 'ip_and_device')).rejects.toThrow(/always bypass/i);
  });

  it('allows setting owner/admin to unrestricted (no-op safe)', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'o1', role: 'owner', accessMode: 'unrestricted' });
    mockUserUpdate.mockResolvedValue({ id: 'o1', accessMode: 'unrestricted' });
    await expect(setUserAccessMode('o1', 'unrestricted')).resolves.toBeDefined();
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it('throws when the user does not exist', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(setUserAccessMode('ghost', 'ip')).rejects.toThrow('User not found');
  });
});

describe('addAllowedIpRange', () => {
  beforeEach(() => mockIpCreate.mockResolvedValue({ id: 'r1', value: 'x', label: null, userId: null }));

  it('accepts a valid IPv4, IPv6, and CIDR and sets createdById to the actor', async () => {
    for (const value of ['203.0.113.7', '2001:db8::1', '203.0.113.0/24', '2001:db8::/32']) {
      await addAllowedIpRange({ value });
    }
    expect(mockIpCreate).toHaveBeenCalledTimes(4);
    expect(mockIpCreate.mock.calls[0][0].data.createdById).toBe('actor-1');
  });

  it('rejects an invalid IP/CIDR before touching the DB', async () => {
    await expect(addAllowedIpRange({ value: 'not-an-ip' })).rejects.toThrow(/Invalid IP/i);
    await expect(addAllowedIpRange({ value: '203.0.113.0/99' })).rejects.toThrow(/Invalid IP/i);
    expect(mockIpCreate).not.toHaveBeenCalled();
  });

  it('validates a per-user scope against a real user', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(addAllowedIpRange({ value: '10.0.0.0/8', userId: 'ghost' })).rejects.toThrow(
      'User not found',
    );
    expect(mockIpCreate).not.toHaveBeenCalled();
  });
});

describe('removeAllowedIpRange', () => {
  it('deletes an existing range', async () => {
    mockIpFindUnique.mockResolvedValue({ id: 'r1', value: '10.0.0.0/8', userId: null });
    await removeAllowedIpRange('r1');
    expect(mockIpDelete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('throws when the range is missing', async () => {
    mockIpFindUnique.mockResolvedValue(null);
    await expect(removeAllowedIpRange('gone')).rejects.toThrow(/not found/i);
  });
});

describe('listAccessOverview', () => {
  it('returns a bounded, recent-first set of access.denied events', async () => {
    mockUserFindMany.mockResolvedValue([]);
    mockIpFindMany.mockResolvedValue([]);
    mockDeviceFindMany.mockResolvedValue([]);
    mockAuditFindMany.mockResolvedValue([]);

    const overview = await listAccessOverview();

    expect(overview).toHaveProperty('users');
    expect(overview).toHaveProperty('ipRanges');
    expect(overview).toHaveProperty('devices');
    expect(overview).toHaveProperty('denials');

    const args = mockAuditFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ action: 'access.denied' });
    expect(args.take).toBe(100);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('exposes live runtime flags reflecting the env', async () => {
    mockUserFindMany.mockResolvedValue([]);
    mockIpFindMany.mockResolvedValue([]);
    mockDeviceFindMany.mockResolvedValue([]);
    mockAuditFindMany.mockResolvedValue([]);

    const orig = process.env.ACCESS_ENFORCE;
    process.env.ACCESS_ENFORCE = 'true';
    try {
      const overview = await listAccessOverview();
      expect(overview.accessEnforcementEnabled).toBe(true);
      expect(typeof overview.accessDetectionEnabled).toBe('boolean');
    } finally {
      if (orig === undefined) delete process.env.ACCESS_ENFORCE;
      else process.env.ACCESS_ENFORCE = orig;
    }
  });
});
