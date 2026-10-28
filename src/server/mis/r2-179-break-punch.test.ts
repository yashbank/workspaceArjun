import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn(async (..._a: unknown[]) => ({}));
const findMany = vi.fn((..._a: unknown[]) => Promise.resolve([] as unknown[]));
vi.mock('@/server/mis/auth', () => ({ requirePermission: vi.fn(async () => ({ userId: 'u', role: 'ADMIN' })) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: vi.fn(async () => 'Asia/Kolkata'), getCorrectionWindowDays: vi.fn(async () => 3), getLunchBreakMinutes: vi.fn(async () => 30) }));
vi.mock('@/server/db', () => ({
  db: { misAttendance: { findMany: (...a: unknown[]) => findMany(...a), update: (...a: unknown[]) => update(...a) }, $transaction: async (ops: unknown[]) => Promise.all(ops) },
}));

const t = (hhmm: string) => new Date(`2026-01-01T${hhmm}:00Z`);
const row = (o: object) => ({ id: 'r1', employeeId: 'e1', clockIn: t('00:00'), clockOut: null, breakOutAt: null, breakInAt: null, ...o });

describe('R2-179 punchBreak', () => {
  beforeEach(() => { update.mockClear(); findMany.mockReset(); });
  it('writes only the break column, never clockIn/clockOut', async () => {
    findMany.mockResolvedValue([row({})]);
    const { punchBreak } = await import('./attendance');
    const out = await punchBreak('OUT', ['e1']);
    expect(out.skipped).toEqual([]);
    const data = (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(Object.keys(data)).toEqual(['breakOutAt']);
  });
  it.each([
    ['not clocked in', 'OUT', [], 'Not clocked in'],
    ['already clocked out', 'OUT', [row({ clockOut: t('01:00') })], 'Already clocked out'],
    ['duplicate out', 'OUT', [row({ breakOutAt: t('00:01') })], 'Break already started'],
    ['in without out', 'IN', [row({})], 'Break not started'],
    ['duplicate in', 'IN', [row({ breakOutAt: t('00:01'), breakInAt: t('00:02') })], 'Break already ended'],
    ['in before out', 'IN', [row({ breakOutAt: new Date(Date.now() + 3_600_000) })], 'Before the break-out'],
  ] as const)('skips: %s', async (_n, kind, rows, reason) => {
    findMany.mockResolvedValue([...rows]);
    const { punchBreak } = await import('./attendance');
    const out = await punchBreak(kind, ['e1']);
    expect(out.skipped[0].reason).toBe(reason);
    expect(update).not.toHaveBeenCalled();
  });
});
