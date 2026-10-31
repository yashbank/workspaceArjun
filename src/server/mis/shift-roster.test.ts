/**
 * R2-263 — shift roster writes are gated on `roster.write`: the register writers AND the Supervisor, nobody else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const rows: Array<Record<string, unknown>> = [];
vi.mock('@/server/db', () => ({
  db: {
    misShift: { findUnique: async () => ({ id: 's1', isActive: true }) },
    misEmployee: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, name: `P-${id}` })) },
    misShiftRoster: {
      findMany: async () => rows,
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      create: ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: `r-${rows.length + 1}`, ...data }),
      delete: async ({ where }: { where: { id: string } }) => { const i = rows.findIndex((r) => r.id === where.id); if (i >= 0) rows.splice(i, 1); },
    },
    $transaction: async (ops: Promise<Record<string, unknown>>[]) => { const out = await Promise.all(ops); rows.push(...out); return out; },
  },
}));

const { assignRoster, removeRoster } = await import('./shift-roster');
const { MisForbiddenError } = await import('./auth');

const input = { employeeIds: ['e1'], shiftId: 's1', startDate: '2026-11-02', endDate: '2026-11-08' };
const WRITERS = ['OWNER', 'ADMIN', 'SUPERVISOR', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR'];

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('R2-263 roster.write', () => {
  it.each(WRITERS)('%s assigns and removes a roster entry (audited)', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(assignRoster(input)).resolves.toEqual({ count: 1 });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ASSIGN_SHIFT_ROSTER' }));
    await removeRoster('r-1');
    expect(rows).toHaveLength(0);
  });

  it.each(MIS_ROLES.filter((r) => !WRITERS.includes(r)))('%s is refused', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(assignRoster(input)).rejects.toThrow(MisForbiddenError);
    expect(rows).toHaveLength(0);
  });
});
