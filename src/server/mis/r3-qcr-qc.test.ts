/**
 * R3-QCR B72 (AQL validation), B73 (check validation), B79 (summary), B84 (edit within 24 h).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely-typed fake-db rows, same convention as qc.test.ts
type Row = Record<string, any>;

const world: { checks: Row[]; orders: Row[]; stages: Row[]; defectTypes: Row[] } = { checks: [], orders: [], stages: [], defectTypes: [] };
let seq = 0;
const audit = vi.fn();

vi.mock('@/server/notifications', () => ({ notifySupervisorsOfQcDefect: vi.fn() }));
vi.mock('@/server/db', () => ({
  db: {
    misQcCheck: {
      create: async ({ data }: Row) => {
        const row = { id: `chk-${++seq}`, result: 'PASS', parameterName: null, defectType: null, defectQty: null, notes: null, acknowledgedAt: null, createdAt: new Date(), checkTime: new Date(), ...data };
        world.checks.push(row);
        return row;
      },
      findUnique: async ({ where }: Row) => world.checks.find((c) => c.id === where.id) ?? null,
      update: async ({ where, data }: Row) => {
        const row = world.checks.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: Row) => world.checks.filter((c) => c.orderId === where.orderId),
    },
    misOrder: { findUnique: async ({ where }: Row) => world.orders.find((o) => o.id === where.id) ?? null },
    misBomStage: {
      findFirst: async ({ where }: Row) => world.stages.find((s) => s.id === where.id && s.orderId === where.bom.orderId) ?? null,
    },
    misDefectType: { findMany: async ({ where }: Row) => world.defectTypes.filter((d) => where.id.in.includes(d.id)) },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/mis/business-rules', () => ({
  getFactoryTimezone: async () => 'Asia/Kolkata',
  getAqlThresholds: async () => ({ sampleSize: 32, criticalMax: 0, majorMax: 2, minorMax: 5 }),
}));

const { addQcCheck, editQcCheck, recordAqlSample, getQcSummary } = await import('./qc');
const { recordChecklistCheck } = await import('./qc-template');

const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  world.checks = [];
  world.orders = [
    { id: 'ord-1', status: 'IN_PRODUCTION' },
    { id: 'ord-x', status: 'CANCELLED' },
    { id: 'ord-done', status: 'COMPLETED' },
  ];
  world.stages = [{ id: 'stage-1', orderId: 'ord-1' }, { id: 'stage-other', orderId: 'ord-2' }];
  world.defectTypes = [{ id: 'dt-major', severity: 'MAJOR' }];
  audit.mockClear();
  as('QC');
});

describe('B72 recordAqlSample validation', () => {
  it.each([0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('sample size %s is refused and no check row is written', async (sampleSize) => {
    await expect(recordAqlSample({ orderId: 'ord-1', sampleSize, defects: [] })).rejects.toThrow(/Sample size/);
    expect(world.checks).toHaveLength(0);
  });

  it('a sample below the required size is refused with the required number', async () => {
    await expect(recordAqlSample({ orderId: 'ord-1', sampleSize: 20, defects: [] })).rejects.toThrow('Sample too small: inspect at least 32');
    expect(world.checks).toHaveLength(0);
  });

  it('an unknown defect type id is refused', async () => {
    await expect(recordAqlSample({ orderId: 'ord-1', sampleSize: 32, defects: [{ defectTypeId: 'nope', qty: 1 }] })).rejects.toThrow('Unknown defect type');
    expect(world.checks).toHaveLength(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('a defect qty of %s is refused', async (qty) => {
    await expect(recordAqlSample({ orderId: 'ord-1', sampleSize: 32, defects: [{ defectTypeId: 'dt-major', qty }] })).rejects.toThrow(/Defect quantity/);
    expect(world.checks).toHaveLength(0);
  });

  it('a valid sample still writes PASS or FAIL as before', async () => {
    const ok = await recordAqlSample({ orderId: 'ord-1', sampleSize: 32, defects: [{ defectTypeId: 'dt-major', qty: 1 }] });
    expect(ok.check.result).toBe('PASS');
    const bad = await recordAqlSample({ orderId: 'ord-1', sampleSize: 32, defects: [{ defectTypeId: 'dt-major', qty: 5 }] });
    expect(bad.check.result).toBe('FAIL');
  });
});

describe('B73 addQcCheck validation', () => {
  it('rejects a result outside PASS/FAIL/NA', async () => {
    await expect(addQcCheck({ orderId: 'ord-1', result: 'MAYBE' as never })).rejects.toThrow(/Pass, Fail or N\/A/);
  });

  it.each([-1, Number.NaN])('rejects a defect qty of %s', async (defectQty) => {
    await expect(addQcCheck({ orderId: 'ord-1', result: 'PASS', defectQty })).rejects.toThrow(/Defect quantity/);
  });

  it('a FAIL with neither a defect type nor a 3-char note is refused; either one is enough', async () => {
    await expect(addQcCheck({ orderId: 'ord-1', result: 'FAIL' })).rejects.toThrow(/defect type or a note/);
    await expect(addQcCheck({ orderId: 'ord-1', result: 'FAIL', notes: 'ab' })).rejects.toThrow(/defect type or a note/);
    await expect(addQcCheck({ orderId: 'ord-1', result: 'FAIL', notes: 'edge split' })).resolves.toMatchObject({ result: 'FAIL' });
    await expect(addQcCheck({ orderId: 'ord-1', result: 'FAIL', defectType: 'TEAR' })).resolves.toMatchObject({ result: 'FAIL' });
  });

  it('a stage from another order is refused with a friendly message', async () => {
    await expect(addQcCheck({ orderId: 'ord-1', bomStageId: 'stage-other', result: 'PASS' })).rejects.toThrow('That process stage does not belong to this order');
    await expect(addQcCheck({ orderId: 'ord-1', bomStageId: 'stage-1', result: 'PASS' })).resolves.toBeTruthy();
  });

  it('a missing order is "Order not found", never a raw FK error', async () => {
    await expect(addQcCheck({ orderId: 'ghost', result: 'PASS' })).rejects.toThrow('Order not found');
  });

  it.each(['ord-x', 'ord-done'])('a closed order (%s) is refused', async (orderId) => {
    await expect(addQcCheck({ orderId, result: 'PASS' })).rejects.toThrow(/can no longer be recorded/);
    expect(world.checks).toHaveLength(0);
  });

  it('the checklist\'s plain FAIL tap (no room for a reason) is still accepted', async () => {
    // recordChecklistCheck reads the template; supply one through the shared db mock.
    const { db } = await import('@/server/db');
    (db as unknown as Row).misQcTemplate = {
      findUnique: async () => ({ id: 't1', isActive: true, deletedAt: null, parameters: ['Shade'], slotStart: '09:15', slotEnd: '10:15' }),
    };
    const rec = await recordChecklistCheck({ orderId: 'ord-1', templateId: 't1', parameterName: 'Shade', slotTime: '09:15', status: 'FAIL' });
    expect(rec.result).toBe('FAIL');
  });
});

describe('B79 getQcSummary', () => {
  it('counts N/A separately so the pass rate can ignore it', async () => {
    for (const result of ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'NA', 'NA']) await addQcCheck({ orderId: 'ord-1', result: result as 'PASS' | 'NA' });
    const s = await getQcSummary('ord-1');
    expect(s).toMatchObject({ total: 10, pass: 8, fail: 0, na: 2 });
    expect(s.pass / (s.pass + s.fail)).toBe(1);
  });
});

describe('B84 editQcCheck', () => {
  const seed = (patch: Row = {}) => {
    // R2-34: a QC inspector edits only their OWN check (checkById = the signed-in 'u1').
    world.checks.push({ id: 'c1', orderId: 'ord-1', result: 'FAIL', defectType: 'TEAR', defectQty: 2, notes: 'edge split', parameterName: 'Shade', acknowledgedAt: null, checkById: 'u1', createdAt: new Date(), ...patch });
    return 'c1';
  };
  // R2-34: a QC inspector's window is the same factory day, so "now" is 23:59:30 IST - 23 h 59 m
  // earlier is still that day, 24 h 01 m earlier is the day before.
  const now = new Date('2026-09-05T18:29:30Z');

  it('23 h 59 m after creation is allowed, and the audit row has before and after', async () => {
    const id = seed({ createdAt: new Date(now.getTime() - (24 * HOUR - 60 * 1000)) });
    const after = await editQcCheck(id, { reason: 'recheck', result: 'PASS', defectType: null, defectQty: null, notes: 'rechecked' }, now);
    expect(after.result).toBe('PASS');
    const call = audit.mock.calls.at(-1)![0];
    expect(call).toMatchObject({ action: 'QC_CHECK_EDIT', entity: 'MisQcCheck', entityId: id });
    expect(call.before).toMatchObject({ result: 'FAIL', defectType: 'TEAR' });
    expect(call.after).toMatchObject({ result: 'PASS', notes: 'rechecked' });
  });

  it('24 h 01 m after creation is refused', async () => {
    const id = seed({ createdAt: new Date(now.getTime() - (24 * HOUR + 60 * 1000)) });
    await expect(editQcCheck(id, { reason: 'recheck', notes: 'late' }, now)).rejects.toThrow('This check can no longer be edited (24 h / acknowledged / order closed)');
  });

  it('an acknowledged check is refused', async () => {
    const id = seed({ createdAt: now, acknowledgedAt: new Date() });
    await expect(editQcCheck(id, { reason: 'recheck', notes: 'x y z' }, now)).rejects.toThrow(/no longer be edited/);
  });

  it('a check on a closed order is refused', async () => {
    const id = seed({ createdAt: now, orderId: 'ord-done' });
    await expect(editQcCheck(id, { reason: 'recheck', notes: 'x y z' }, now)).rejects.toThrow(/no longer be edited/);
  });

  it('the patch is validated as an add is (FAIL needs a reason; negative qty refused)', async () => {
    const id = seed({ createdAt: now, result: 'PASS', defectType: null, notes: null });
    await expect(editQcCheck(id, { reason: 'recheck', result: 'FAIL' }, now)).rejects.toThrow(/defect type or a note/);
    await expect(editQcCheck(id, { reason: 'recheck', defectQty: -1 }, now)).rejects.toThrow(/Defect quantity/);
  });

  it.each(MIS_ROLES.filter((r) => !['OWNER', 'ADMIN', 'QC', 'SUPERVISOR'].includes(r)))('%s (no qc.write) is forbidden', async (role) => {
    const id = seed({ createdAt: now });
    as(role);
    await expect(editQcCheck(id, { reason: 'recheck', notes: 'abc' }, now)).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });

  it('QC may edit', async () => {
    const id = seed({ createdAt: now });
    as('QC');
    await expect(editQcCheck(id, { reason: 'recheck', notes: 'abc def' }, now)).resolves.toMatchObject({ notes: 'abc def' });
  });
});
