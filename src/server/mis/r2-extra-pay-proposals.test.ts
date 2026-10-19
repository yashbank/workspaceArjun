/** R2-116: the proposals list carries the proposer, never the value, and is attendance.write only. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misExtraPayDay: { findMany: (...a: unknown[]) => findMany(...a) },
    userProfile: { findMany: async () => [{ id: 'u1', name: 'Priya', email: 'p@x.in' }, { id: 'u2', name: null, email: 'q@x.in' }] },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { listExtraPayProposals } = await import('./extra-pay-days');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  findMany.mockResolvedValue([
    { id: 'x1', date: new Date('2026-10-20T00:00:00Z'), scope: 'ALL_PRESENT', reason: 'Diwali', status: 'PENDING', proposedById: 'u1' },
    { id: 'x2', date: new Date('2026-10-21T00:00:00Z'), scope: 'EMPLOYEES', reason: 'Rush', status: 'APPROVED', proposedById: 'u2' },
  ]);
});

describe('listExtraPayProposals', () => {
  it('returns the proposer (name, else email) and no value', async () => {
    getMisRole.mockResolvedValue('SUPER_ATTENDANCE_OPERATOR');
    const rows = await listExtraPayProposals();
    expect(rows.map((r) => r.proposedByName)).toEqual(['Priya', 'q@x.in']);
    expect(rows[0]).toMatchObject({ date: '2026-10-20', status: 'PENDING' });
    for (const r of rows) expect(r).not.toHaveProperty('value');
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('value');
  });
  it('refuses roles without attendance.write', async () => {
    for (const role of ['WORKER', 'SUPERVISOR', 'QC', 'STORE_GUY']) {
      getMisRole.mockResolvedValue(role);
      await expect(listExtraPayProposals()).rejects.toThrow(/Not permitted/);
    }
  });
});
