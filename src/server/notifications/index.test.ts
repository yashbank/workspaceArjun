/**
 * `notifySupervisorsOfQcDefect` — MIS-174/191, "immediate notification" on a logged QC defect.
 *
 * Same `notification` table `job-phases.ts`'s sign-off handover already writes to (MIS-163's
 * precedent): one row per active SUPERVISOR with a login, never a second notification system.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const world: { users: Row[] } = { users: [] };
const created: Row[] = [];

vi.mock('@/server/db', () => ({
  db: {
    userProfile: {
      findMany: async (args: { where: { misEmployee: { role: string; isActive: boolean; deletedAt: null } } }) => {
        const cond = args.where.misEmployee;
        return world.users.filter((u) => {
          const emp = u.misEmployee as Row | null;
          return !!emp && emp.role === cond.role && emp.isActive === cond.isActive && emp.deletedAt === cond.deletedAt;
        });
      },
    },
    notification: {
      createMany: async (args: { data: Row[] }) => {
        created.push(...args.data);
        return { count: args.data.length };
      },
    },
  },
}));

const { notifySupervisorsOfQcDefect } = await import('./index');

const payload = {
  orderId: 'ord-1',
  orderNumber: 'ORD-118',
  parameterName: 'Shade',
  defectType: 'TEAR',
  checkTime: '2026-09-10T08:00:00.000Z',
};

beforeEach(() => {
  created.length = 0;
  world.users = [
    { id: 'sup-1', misEmployee: { role: 'SUPERVISOR', isActive: true, deletedAt: null } },
    { id: 'sup-2', misEmployee: { role: 'SUPERVISOR', isActive: true, deletedAt: null } },
    // Not eligible: wrong role, inactive, soft-deleted, or no login at all.
    { id: 'qc-1', misEmployee: { role: 'QC', isActive: true, deletedAt: null } },
    { id: 'sup-inactive', misEmployee: { role: 'SUPERVISOR', isActive: false, deletedAt: null } },
    { id: 'sup-deleted', misEmployee: { role: 'SUPERVISOR', isActive: true, deletedAt: new Date('2026-01-01') } },
  ];
});

describe('notifySupervisorsOfQcDefect', () => {
  it('writes one notification row per active SUPERVISOR with a login, and none for any other role', async () => {
    await notifySupervisorsOfQcDefect(payload);
    expect(created).toHaveLength(2);
    expect(created.map((n) => n.userId).sort()).toEqual(['sup-1', 'sup-2']);
  });

  it('every written row carries the qc defect type and the full payload', async () => {
    await notifySupervisorsOfQcDefect(payload);
    for (const row of created) {
      expect(row.type).toBe('mis.qc_defect');
      expect(row.payload).toEqual(payload);
    }
  });

  it('no SUPERVISOR with a login → no write at all (not even an empty createMany)', async () => {
    world.users = world.users.filter((u) => (u.misEmployee as Row).role !== 'SUPERVISOR');
    await notifySupervisorsOfQcDefect(payload);
    expect(created).toHaveLength(0);
  });
});
