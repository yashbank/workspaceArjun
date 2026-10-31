/**
 * R2-337: assigning a roster range that overlaps an existing entry cuts the old entry around the new
 * one after confirmation (`replaceOverlaps`), so history is kept and nothing has to be deleted wholesale.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; employeeId: string; shiftId: string; startDate: Date; endDate: Date };
const rows: Row[] = [];
let seq = 0;
const audit = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'ADMIN' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/db', () => ({
  db: {
    misShift: { findUnique: async () => ({ id: 's-night', isActive: true }) },
    misEmployee: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, name: `P-${id}` })) },
    misShiftRoster: {
      findMany: async ({ where }: { where: { employeeId: { in: string[] } } }) => rows.filter((r) => where.employeeId.in.includes(r.employeeId)).map((r) => ({ ...r })),
      // Lazy operations: a thenable that runs when awaited, so $transaction applies them in order.
      create: ({ data }: { data: Omit<Row, 'id'> & { createdBy: string } }) => Promise.resolve().then(() => { const row = { id: `r${++seq}`, ...data }; rows.push(row); return row; }),
      update: ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Promise.resolve().then(() => { const row = rows.find((r) => r.id === where.id)!; Object.assign(row, data); return row; }),
      delete: ({ where }: { where: { id: string } }) => Promise.resolve().then(() => { const i = rows.findIndex((r) => r.id === where.id); return rows.splice(i, 1)[0]; }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { assignRoster } = await import('./shift-roster');
const day = (k: string) => new Date(`${k}T00:00:00Z`);
const asKeys = () => rows.map((r) => `${r.employeeId}:${r.shiftId}:${r.startDate.toISOString().slice(0, 10)}..${r.endDate.toISOString().slice(0, 10)}`).sort();

beforeEach(() => {
  rows.length = 0;
  seq = 0;
  audit.mockClear();
  rows.push({ id: 'old', employeeId: 'e1', shiftId: 's-day', startDate: day('2026-10-01'), endDate: day('2026-10-31') });
});

describe('R2-337 assignRoster over an existing range', () => {
  const week = { employeeIds: ['e1'], shiftId: 's-night', startDate: '2026-10-20', endDate: '2026-10-27' };

  it('without confirmation it writes nothing and names who overlaps', async () => {
    await expect(assignRoster(week)).resolves.toEqual({ count: 0, overlaps: ['P-e1'] });
    expect(asKeys()).toEqual(['e1:s-day:2026-10-01..2026-10-31']);
  });

  it('with replaceOverlaps the old month is cut into head + tail around the new week, audited', async () => {
    await expect(assignRoster({ ...week, replaceOverlaps: true })).resolves.toEqual({ count: 1 });
    expect(asKeys()).toEqual([
      'e1:s-day:2026-10-01..2026-10-19',
      'e1:s-day:2026-10-28..2026-10-31',
      'e1:s-night:2026-10-20..2026-10-27',
    ]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CUT_SHIFT_ROSTER', entityId: 'old' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ASSIGN_SHIFT_ROSTER' }));
  });

  it('a range covering the whole old entry removes it; another employee is untouched', async () => {
    rows.push({ id: 'other', employeeId: 'e2', shiftId: 's-day', startDate: day('2026-10-01'), endDate: day('2026-10-31') });
    await assignRoster({ employeeIds: ['e1'], shiftId: 's-night', startDate: '2026-09-01', endDate: '2026-12-31', replaceOverlaps: true });
    expect(asKeys()).toEqual(['e1:s-night:2026-09-01..2026-12-31', 'e2:s-day:2026-10-01..2026-10-31']);
  });
});
