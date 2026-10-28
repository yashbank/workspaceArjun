/** R2-169 — the proposer withdraws their own PENDING extra-pay proposal; nobody else, nothing decided. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const deleteMany = vi.fn();
vi.mock('@/server/db', () => ({
  db: { misExtraPayDay: { findUnique: (...a: unknown[]) => findUnique(...a), deleteMany: (...a: unknown[]) => deleteMany(...a) } },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const { withdrawExtraPayProposal } = await import('./extra-pay-days');

const row = { id: 'x1', date: new Date('2026-10-20T00:00:00Z'), kind: 'FLAT_AMOUNT', scope: 'ALL_PRESENT', status: 'PENDING', reason: 'Diwali', proposedById: 'u1' };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPER_ATTENDANCE_OPERATOR');
  findUnique.mockResolvedValue(row);
  deleteMany.mockResolvedValue({ count: 1 });
});

describe('withdrawExtraPayProposal', () => {
  it('removes the proposer\'s own PENDING proposal (guarded in the where) and audits it without the value', async () => {
    await withdrawExtraPayProposal('x1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'x1', status: 'PENDING', proposedById: 'u1' } });
    const a = audit.mock.calls[0][0];
    expect(a).toMatchObject({ action: 'extraPayDay.withdraw', entityId: 'x1' });
    expect(a.before).not.toHaveProperty('value');
  });

  it('refuses someone else\'s proposal, an already-decided one, and a role without attendance.write', async () => {
    findUnique.mockResolvedValue({ ...row, proposedById: 'u2' });
    await expect(withdrawExtraPayProposal('x1')).rejects.toThrow('Only the person who proposed');
    findUnique.mockResolvedValue(row);
    deleteMany.mockResolvedValue({ count: 0 });
    await expect(withdrawExtraPayProposal('x1')).rejects.toThrow('Already decided.');
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(withdrawExtraPayProposal('x1')).rejects.toThrow(/Not permitted/);
  });
});
