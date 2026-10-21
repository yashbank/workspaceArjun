/**
 * R2-17 (production log edit/delete) and R2-34 (QC check edit/delete):
 * Admin/Owner within 7 days; QC inspector own checks, same day; supervisor production edit 24 h;
 * a reason on every change, written to the audit row. Db-free.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/notifications', () => ({ notifySupervisorsOfQcDefect: vi.fn() }));
vi.mock('@/server/mis/line-clearance', () => ({ assertLineCleared: vi.fn() }));
vi.mock('@/server/mis/business-rules', () => ({
  getFactoryTimezone: async () => 'Asia/Kolkata',
  getAqlThresholds: async () => ({ sampleSize: 32, criticalMax: 0, majorMax: 2, minorMax: 5 }),
}));

const world: { log: Row | null; check: Row | null; allocUpdates: Row[] } = { log: null, check: null, allocUpdates: [] };
vi.mock('@/server/db', () => ({
  db: {
    misProductionLog: {
      findUnique: async () => world.log,
      update: async ({ data }: Row) => Object.assign(world.log!, data),
    },
    misQcCheck: {
      findUnique: async () => world.check,
      update: async ({ data }: Row) => Object.assign(world.check!, data),
    },
    misOrder: { findUnique: async () => ({ status: 'IN_PRODUCTION', orderNumber: 'ORD-1' }) },
    misMachineAllocation: {
      updateMany: async (args: Row) => {
        world.allocUpdates.push(args);
        return { count: 1 };
      },
    },
  },
}));

const { editProductionLog, voidProductionLog } = await import('./production');
const { editQcCheck, voidQcCheck } = await import('./qc');

const H = 3_600_000;
const NOW = new Date('2026-10-19T09:00:00Z'); // 14:30 IST
const as = (role: string, id = 'u1') => {
  getCurrentUser.mockResolvedValue({ id });
  getMisRole.mockResolvedValue(role);
};
const log = (ageMs: number, over: Row = {}) => ({
  id: 'l1', orderId: 'o1', machineId: 'm1', loggedById: 'sup', loggedAt: new Date(NOW.getTime() - ageMs), qtyProduced: 100, qtyWaste: 2,
  unit: 'KG', bomStageId: null, voidedAt: null, jobPhase: { status: 'IN_PROGRESS' }, order: { status: 'IN_PRODUCTION' }, ...over,
});
const check = (ageMs: number, over: Row = {}) => ({
  id: 'c1', orderId: 'o1', result: 'PASS', defectType: null, defectQty: null, notes: null, parameterName: 'Shade', checkById: 'qc1',
  acknowledgedAt: null, voidedAt: null, createdAt: new Date(NOW.getTime() - ageMs), checkTime: new Date(NOW.getTime() - ageMs), ...over,
});

beforeEach(() => {
  audit.mockClear();
  world.allocUpdates = [];
});

describe('R2-17 editProductionLog', () => {
  it('ADMIN and OWNER may edit up to 7 days; 7 days + 1 minute is refused', async () => {
    for (const role of ['ADMIN', 'OWNER']) {
      as(role);
      world.log = log(7 * 24 * H - 60_000);
      await expect(editProductionLog('l1', { qtyProduced: 90, reason: 'count fixed' }, NOW)).resolves.toBeDefined();
      world.log = log(7 * 24 * H + 60_000);
      await expect(editProductionLog('l1', { qtyProduced: 90, reason: 'count fixed' }, NOW)).rejects.toThrow(/older than 7 days/);
    }
  });
  it('a SUPERVISOR keeps the 24 h window (B126), not 7 days', async () => {
    as('SUPERVISOR');
    world.log = log(2 * 24 * H);
    await expect(editProductionLog('l1', { qtyProduced: 90, reason: 'count fixed' }, NOW)).rejects.toThrow(/24 h/);
  });
  it('needs a reason, and the reason is on the audit row', async () => {
    as('ADMIN');
    world.log = log(3 * 24 * H);
    await expect(editProductionLog('l1', { qtyProduced: 90 }, NOW)).rejects.toThrow(/reason/);
    await expect(editProductionLog('l1', { qtyProduced: 90, reason: ' x ' }, NOW)).rejects.toThrow(/reason/);
    await editProductionLog('l1', { qtyProduced: 90, reason: 'wrong reel weighed' }, NOW);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRODUCTION_LOG_EDIT', reason: 'wrong reel weighed' }));
  });
  it('R2-48 makeready can be corrected and cleared; a bad value is refused', async () => {
    as('ADMIN');
    world.log = log(H);
    await editProductionLog('l1', { makereadyMinutes: 40, reason: 'set-up time' }, NOW);
    expect(world.log!.makereadyMinutes).toBe(40);
    await editProductionLog('l1', { makereadyMinutes: null, reason: 'not measured' }, NOW);
    expect(world.log!.makereadyMinutes).toBeNull();
    await expect(editProductionLog('l1', { makereadyMinutes: 2000, reason: 'oops' }, NOW)).rejects.toThrow(/Makeready/);
  });
  it.each(['QC', 'WORKER', 'STORE_GUY', 'ATTENDANCE_OPERATOR'])('%s is forbidden (production.write)', async (role) => {
    as(role);
    world.log = log(H);
    await expect(editProductionLog('l1', { qtyProduced: 90, reason: 'x y z' }, NOW)).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
  it('a voided entry cannot be edited', async () => {
    as('ADMIN');
    world.log = log(H, { voidedAt: new Date() });
    await expect(editProductionLog('l1', { qtyProduced: 90, reason: 'x y z' }, NOW)).rejects.toThrow(/no longer exists/);
  });
});

describe('R2-17 voidProductionLog (delete)', () => {
  it('ADMIN voids within 7 days with a reason; the board block it created is released; audited', async () => {
    as('ADMIN');
    world.log = log(5 * 24 * H);
    const rec = await voidProductionLog('l1', 'entered twice', NOW);
    expect(rec).toMatchObject({ voidedAt: NOW, voidReason: 'entered twice' });
    expect(world.allocUpdates[0]).toEqual({ where: { productionLogId: 'l1', source: 'PRODUCTION_LOG', releasedAt: null }, data: { releasedAt: NOW } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRODUCTION_LOG_VOID', entityId: 'l1', reason: 'entered twice' }));
  });
  it('a SUPERVISOR cannot delete, even a fresh entry', async () => {
    as('SUPERVISOR');
    world.log = log(H);
    await expect(voidProductionLog('l1', 'entered twice', NOW)).rejects.toThrow('Only an Admin or the Owner can change this entry.');
    expect(world.log!.voidedAt).toBeNull();
  });
  it('older than 7 days, no reason, or a signed-off phase is refused', async () => {
    as('OWNER');
    world.log = log(8 * 24 * H);
    await expect(voidProductionLog('l1', 'entered twice', NOW)).rejects.toThrow(/7 days/);
    world.log = log(H);
    await expect(voidProductionLog('l1', '', NOW)).rejects.toThrow(/reason/);
    world.log = log(H, { jobPhase: { status: 'SIGNED_OFF' } });
    await expect(voidProductionLog('l1', 'entered twice', NOW)).rejects.toThrow(/Reopen the phase/);
  });
  it.each(['QC', 'WORKER'])('%s is forbidden', async (role) => {
    as(role);
    world.log = log(H);
    await expect(voidProductionLog('l1', 'entered twice', NOW)).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});

describe('R2-34 editQcCheck / voidQcCheck', () => {
  it('a QC inspector edits their own check the same factory day, with a reason', async () => {
    as('QC', 'qc1');
    world.check = check(5 * H); // 09:30 IST today
    await expect(editQcCheck('c1', { notes: 'rechecked', reason: 'misread gauge' }, NOW)).resolves.toMatchObject({ notes: 'rechecked' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'QC_CHECK_EDIT', reason: 'misread gauge' }));
  });
  it("a QC inspector cannot edit someone else's check, or their own from yesterday", async () => {
    as('QC', 'qc2');
    world.check = check(H);
    await expect(editQcCheck('c1', { notes: 'x', reason: 'abc' }, NOW)).rejects.toThrow(/recorded yourself/);
    as('QC', 'qc1');
    world.check = check(16 * H); // 22:30 IST yesterday
    await expect(editQcCheck('c1', { notes: 'x', reason: 'abc' }, NOW)).rejects.toThrow(/day it was recorded/);
  });
  it('ADMIN / OWNER may edit any check up to 7 days', async () => {
    as('ADMIN', 'adm');
    world.check = check(6 * 24 * H);
    await expect(editQcCheck('c1', { notes: 'x', reason: 'abc' }, NOW)).resolves.toBeDefined();
    world.check = check(8 * 24 * H);
    await expect(editQcCheck('c1', { notes: 'x', reason: 'abc' }, NOW)).rejects.toThrow(/7 days/);
  });
  it('a SUPERVISOR (qc.write) is refused: not in the R2-34 rule', async () => {
    as('SUPERVISOR');
    world.check = check(H);
    await expect(editQcCheck('c1', { notes: 'x', reason: 'abc' }, NOW)).rejects.toThrow(/Only an Admin or the Owner/);
  });
  it('an edit with no reason is refused', async () => {
    as('QC', 'qc1');
    world.check = check(H);
    await expect(editQcCheck('c1', { notes: 'x' }, NOW)).rejects.toThrow(/reason/);
  });
  it('void: own same-day check by QC, audited; voided check is gone for edits', async () => {
    as('QC', 'qc1');
    world.check = check(H);
    await voidQcCheck('c1', 'wrong order', NOW);
    expect(world.check).toMatchObject({ voidedAt: NOW, voidReason: 'wrong order' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'QC_CHECK_VOID', reason: 'wrong order' }));
    await expect(editQcCheck('c1', { notes: 'x', reason: 'abc' }, NOW)).rejects.toThrow('QC check not found');
  });
  it('void: an acknowledged failure is refused', async () => {
    as('OWNER');
    world.check = check(H, { result: 'FAIL', acknowledgedAt: new Date() });
    await expect(voidQcCheck('c1', 'wrong order', NOW)).rejects.toThrow(/acknowledged/);
  });
  it.each(['WORKER', 'STORE_GUY', 'ATTENDANCE_OPERATOR'])('%s is forbidden (qc.write)', async (role) => {
    as(role);
    world.check = check(H);
    await expect(voidQcCheck('c1', 'wrong order', NOW)).rejects.toMatchObject({ name: 'MisForbiddenError' });
    await expect(editQcCheck('c1', { notes: 'x', reason: 'abc' }, NOW)).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});
