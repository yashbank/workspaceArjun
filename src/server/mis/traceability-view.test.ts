/**
 * Phase 24E · D11 — `getTraceView` at the SERVER FUNCTION.
 *
 * The gate is `orders.read` (OWNER, ADMIN, SUPERVISOR, QC); STORE_GUY and the attendance roles are refused with no
 * query. Each STEP then needs its own permission or is `denied`: a QC reader sees phases and QC, not the store.
 * A step with nothing behind it is `none`. Nothing carries money, and the BOM is never selected with a rate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: string[] = [];
const args: Record<string, Row[]> = {};
const world: {
  zone: string; visible: Row; orders: Row[]; bom: Row | null; grnItems: Row[]; ledger: Row[]; txns: Row[]; phases: Row[]; checks: Row[]; profiles: Row[];
} = { zone: 'Asia/Kolkata', visible: {}, orders: [], bom: null, grnItems: [], ledger: [], txns: [], phases: [], checks: [], profiles: [] };
const note = (q: string, a?: Row) => { queries.push(q); if (a) (args[q] ??= []).push(a); };

vi.mock('@/server/db', () => ({
  db: {
    misOrder: {
      findFirst: async (a: { where: { AND: Row[] } }) => {
        note('order.findFirst', a as Row);
        const [visible, byNumber] = a.where.AND as [Row, { orderNumber: { equals: string } }];
        return world.orders.find((o) => String(o.orderNumber).toLowerCase() === byNumber.orderNumber.equals.toLowerCase() && Object.entries(visible).every(([k, v]) => o[k] === v)) ?? null;
      },
      findMany: async (a: { where: { AND: [Row, { id: { in: string[] } }] } }) => {
        note('order.findMany', a as Row);
        const [visible, byId] = a.where.AND;
        return world.orders.filter((o) => byId.id.in.includes(o.id as string) && Object.entries(visible).every(([k, v]) => o[k] === v));
      },
    },
    misBom: { findUnique: async (a: Row) => { note('bom', a); return world.bom; } },
    misGrnItem: {
      // The lot search filters by batch number (case-insensitively); the material lookup by item.
      findMany: async (a: { where: { batchNo?: { equals: string } } }) => {
        note('grnItem', a as Row);
        const wanted = a.where.batchNo?.equals.toLowerCase();
        return wanted ? world.grnItems.filter((r) => String(r.batchNo).toLowerCase() === wanted) : world.grnItems;
      },
    },
    misInventoryLedger: { findMany: async (a: Row) => { note('ledger', a); return world.ledger; } },
    misStoreTransaction: { findMany: async (a: Row) => { note('txn', a); return world.txns; } },
    misJobPhase: { findMany: async (a: Row) => { note('phases', a); return world.phases; } },
    misQcCheck: { findMany: async (a: Row) => { note('checks', a); return world.checks; } },
    userProfile: { findMany: async (a: { where: { id: { in: string[] } } }) => { note('profiles'); return world.profiles.filter((p) => a.where.id.in.includes(p.id as string)); } },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.zone }));
vi.mock('@/server/mis/visibility', () => ({ resolveVisibleOrderWhere: async () => world.visible }));

const { getTraceView } = await import('./traceability-view');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const NOW = new Date('2026-09-10T10:00:00Z');
const at = (iso: string) => new Date(`${iso}+05:30`);
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};
const denied = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).name === 'MisForbiddenError';
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  for (const k of Object.keys(args)) delete args[k];
  world.zone = 'Asia/Kolkata';
  world.visible = {};
  world.profiles = [{ id: 'p1', name: 'S. Patil' }, { id: 'p2', name: 'R. Kumar' }, { id: 'p3', name: 'S. Kulkarni' }, { id: 'p4', name: 'A. Bhaskar' }];
  world.orders = [{ id: 'o1', orderNumber: 'ORD-2026-118', description: 'Duplex carton', status: 'IN_PRODUCTION', deliveryDate: at('2026-09-18T00:00:00'), createdAt: at('2026-08-28T10:00:00'), createdById: 'p4', customer: { name: 'Acme' } }];
  world.bom = { stages: [{ materials: [{ itemId: 'i1', description: 'FBB', quantity: 1240, unit: 'KG', item: { name: 'FBB 300 gsm', unit: 'KG' } }] }] };
  world.grnItems = [
    { receivedQty: 2400, batchNo: 'RM-FBB-4417', poItem: { itemId: 'i1' }, grn: { grnNumber: 'GRN-1', receivedAt: at('2026-08-21T09:14:00'), receivedById: 'p1' } },
    { receivedQty: 500, batchNo: 'RM-FBB-4300', poItem: { itemId: 'i1' }, grn: { grnNumber: 'GRN-0', receivedAt: at('2026-07-01T09:00:00'), receivedById: 'p1' } },
  ];
  world.ledger = [{ itemId: 'i1', changeQty: -1240, createdAt: at('2026-09-05T06:20:00'), item: { name: 'FBB 300 gsm', unit: 'KG' } }];
  // Another item's issue comes FIRST in the list: pairing must be by item, quantity and time — not by position.
  world.txns = [{ itemId: 'i9', quantity: 5, createdAt: at('2026-09-05T06:20:01'), createdById: 'p3', isOverIssue: false }, { itemId: 'i1', quantity: 1240, createdAt: at('2026-09-05T06:20:02'), createdById: 'p2', isOverIssue: false }];
  world.phases = [
    { sequence: 1, status: 'SIGNED_OFF', startedAt: at('2026-09-05T06:12:00'), startedById: 'p2', signedOffAt: at('2026-09-05T06:30:00'), signedOffById: 'p2', process: { name: 'Line clearance' }, inCharge: { name: 'R. Kumar' } },
    { sequence: 2, status: 'IN_PROGRESS', startedAt: at('2026-09-05T06:40:00'), startedById: 'p2', signedOffAt: null, signedOffById: null, process: { name: 'Printing' }, inCharge: { name: 'R. Kumar' } },
    { sequence: 3, status: 'PENDING', startedAt: null, startedById: null, signedOffAt: null, signedOffById: null, process: { name: 'Lamination' }, inCharge: null },
  ];
  world.checks = [
    { id: 'c1', bomStageId: null, parameterName: 'Shade', result: 'FAIL', defectType: 'major', checkTime: at('2026-09-05T09:00:00'), checkById: 'p3', orderId: 'o1' },
    { id: 'c2', bomStageId: null, parameterName: 'Shade', result: 'PASS', defectType: null, checkTime: at('2026-09-05T09:40:00'), checkById: 'p3', orderId: 'o1' },
    { id: 'c3', bomStageId: null, parameterName: 'Registration', result: 'PASS', defectType: null, checkTime: at('2026-09-05T08:00:00'), checkById: 'p3', orderId: 'o1' },
  ];
});

describe('who may search', () => {
  it.each(READERS)('%s is served', async (role) => {
    as(role);
    expect((await getTraceView({ q: 'ORD-2026-118' }, NOW)).mode).toBe('order');
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is REFUSED at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getTraceView({ q: 'ORD-2026-118' }, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => getTraceView({ q: 'x' }, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });
});

describe('each step needs its own permission, or is denied — never blank', () => {
  it.each([
    ['OWNER', { material: 'ok', issues: 'ok', phases: 'ok', qc: 'ok' }],
    ['ADMIN', { material: 'ok', issues: 'ok', phases: 'ok', qc: 'ok' }],
    ['SUPERVISOR', { material: 'ok', issues: 'ok', phases: 'ok', qc: 'ok' }],
    ['QC', { material: 'denied', issues: 'denied', phases: 'ok', qc: 'ok' }],
  ] as const)('%s sees %j', async (role, states) => {
    as(role);
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect({ material: v.material.state, issues: v.issues.state, phases: v.phases.state, qc: v.qc.state }).toEqual(states);
  });

  it('a step this role may not read is never QUERIED, and its people and times are not in the log', async () => {
    as('QC');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(queries).not.toContain('grnItem');
    expect(queries).not.toContain('ledger');
    expect(queries).not.toContain('bom');
    expect(v.events.map((e) => e.kind)).not.toContain('RECEIVED');
    expect(v.events.map((e) => e.kind)).not.toContain('ISSUED');
    expect(v.events.map((e) => e.kind)).toContain('QC_FAILED');
  });

  it('a step with nothing behind it is "none", not an empty ok', async () => {
    as('OWNER');
    world.ledger = [];
    world.phases = [];
    world.checks = [];
    world.bom = null;
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect([v.material.state, v.issues.state, v.phases.state, v.qc.state]).toEqual(['none', 'none', 'none', 'none']);
  });
});

describe('no money, ever', () => {
  it.each(READERS)('%s: no rate, price, cost or rupee in the payload', async (role) => {
    as(role);
    const text = JSON.stringify([await getTraceView({ q: 'ORD-2026-118' }, NOW), await getTraceView({ q: 'RM-FBB-4417' }, NOW)]);
    expect(text).not.toMatch(/rate|price|cost|wage|salary|₹|amount/i);
  });

  it('the BOM is selected with description, quantity, unit and item name only — never a rate', async () => {
    as('OWNER');
    await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(JSON.stringify(args.bom)).not.toMatch(/rate/i);
    expect(JSON.stringify(args.grnItem)).not.toMatch(/rate|price/i);
    expect(JSON.stringify(args.ledger)).not.toMatch(/rate|price/i);
  });
});

describe('searching', () => {
  it('nothing typed is idle and asks nothing; an array or a number is nothing typed', async () => {
    as('OWNER');
    expect((await getTraceView({}, NOW)).mode).toBe('idle');
    expect((await getTraceView({ q: ['x'] }, NOW)).mode).toBe('idle');
    expect((await getTraceView({ q: 5 }, NOW)).mode).toBe('idle');
    expect(queries).toEqual([]);
  });

  it('an order number matches without regard to case or spacing', async () => {
    as('OWNER');
    expect((await getTraceView({ q: '  ord-2026-118 ' }, NOW)).order!.orderNumber).toBe('ORD-2026-118');
  });

  it('no order and no lot is "none" — an honest answer, not an error', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'NOPE-1' }, NOW);
    expect(v).toMatchObject({ mode: 'none', lotDenied: false, order: null, lot: null });
  });

  it('a role that may not read receipts is told the lot search is unavailable — the receipts are not queried', async () => {
    as('QC');
    const v = await getTraceView({ q: 'RM-FBB-4417' }, NOW);
    expect(v).toMatchObject({ mode: 'none', lotDenied: true });
    expect(queries).not.toContain('grnItem');
  });

  it('an order the caller may not see (the D4 seam) is not found', async () => {
    as('OWNER');
    world.visible = { createdById: 'someone-else' };
    expect((await getTraceView({ q: 'ORD-2026-118' }, NOW)).mode).toBe('none');
  });
});

describe('the order chain', () => {
  it('names the order, its customer, who raised it and when — on the factory clock (D22)', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(v.order).toMatchObject({ orderNumber: 'ORD-2026-118', customer: 'Acme', status: 'IN_PRODUCTION', raisedLabel: '28/08 10:00', raisedBy: 'A. Bhaskar', deliveryLabel: '18/09/2026' });
    world.zone = 'UTC';
    expect((await getTraceView({ q: 'ORD-2026-118' }, NOW)).order!.raisedLabel).toBe('28/08 04:30');
  });

  it('material: the receipts of each BOM item, newest first, each with its batch, quantity, time and person', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(v.material).toMatchObject({ state: 'ok' });
    const item = (v.material as { state: 'ok'; data: { name: string; receipts: unknown[] }[] }).data[0];
    expect(item.name).toBe('FBB 300 gsm');
    expect(item.receipts).toEqual([
      { grnNumber: 'GRN-1', batchNo: 'RM-FBB-4417', qty: 2400, unit: 'KG', receivedLabel: '21/08 09:14', by: 'S. Patil' },
      { grnNumber: 'GRN-0', batchNo: 'RM-FBB-4300', qty: 500, unit: 'KG', receivedLabel: '01/07 09:00', by: 'S. Patil' },
    ]);
  });

  it('issued: quantity, time and the person who issued it, paired from the store transaction', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(v.issues).toEqual({ state: 'ok', data: [{ itemName: 'FBB 300 gsm', unit: 'KG', qty: 1240, atLabel: '05/09 06:20', by: 'R. Kumar', overIssue: false }] });
  });

  it('an issue whose transaction cannot be paired has NO invented person', async () => {
    as('OWNER');
    world.txns = [];
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect((v.issues as { data: { by: string | null }[] }).data[0].by).toBeNull();
  });

  it('phases: how many of how many, and each with who started and who signed, on the factory clock', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    const p = (v.phases as { state: 'ok'; data: { done: number; total: number; rows: { name: string; signedBy: string | null; signedLabel: string | null }[] } }).data;
    expect(p).toMatchObject({ done: 1, total: 3 });
    expect(p.rows[0]).toMatchObject({ name: 'Line clearance', signedBy: 'R. Kumar', signedLabel: '05/09 06:30' });
    expect(p.rows[2]).toMatchObject({ name: 'Lamination', signedBy: null, signedLabel: null });
  });

  it('QC: taken, failed, and the failure with its clearance and both people', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(v.qc).toMatchObject({ state: 'ok', data: { taken: 3, pass: 2, fail: 1 } });
    const f = (v.qc as { data: { failures: unknown[] } }).data.failures[0];
    expect(f).toMatchObject({ parameter: 'Shade', atLabel: '05/09 09:00', by: 'S. Kulkarni', cleared: '05/09 09:40', clearedBy: 'S. Kulkarni' });
  });

  it('despatch is only the order\'s status — there is no despatch record, and no "contained" verdict', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(v.despatch).toEqual({ status: 'IN_PRODUCTION' });
    expect(JSON.stringify(v)).not.toMatch(/contained|despatched/i);
  });

  it('the event log is newest first, built from existing rows, each with a person where one is recorded', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(v.events.map((e) => `${e.atLabel} ${e.kind}`)).toEqual([
      '05/09 09:40 QC_CLEARED', '05/09 09:00 QC_FAILED', '05/09 06:40 PHASE_STARTED', '05/09 06:30 PHASE_SIGNED', '05/09 06:20 ISSUED', '05/09 06:12 PHASE_STARTED',
      '28/08 10:00 ORDER_RAISED', '21/08 09:14 RECEIVED', '01/07 09:00 RECEIVED',
    ]);
  });

  it('a QC checker with no profile is null — the phone layer\'s dash is not a name', async () => {
    as('OWNER');
    world.checks = world.checks.map((c) => ({ ...c, checkBy: { name: '—' } }));
    world.profiles = world.profiles.filter((p) => p.id !== 'p3');
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    const f = (v.qc as { data: { failures: { by: string | null; clearedBy: string | null }[] } }).data.failures[0];
    expect(f.by).toBeNull();
    expect(f.clearedBy).toBeNull();
    for (const e of v.events.filter((e) => e.kind.startsWith('QC_'))) expect(e.by).toBeNull();
  });

  it('two identical issues seconds apart each get THEIR OWN transaction\'s person', async () => {
    as('OWNER');
    world.ledger = [
      { itemId: 'i1', changeQty: -100, createdAt: at('2026-09-05T06:20:00'), item: { name: 'FBB 300 gsm', unit: 'KG' } },
      { itemId: 'i1', changeQty: -100, createdAt: at('2026-09-05T06:20:05'), item: { name: 'FBB 300 gsm', unit: 'KG' } },
      { itemId: 'i1', changeQty: -100, createdAt: at('2026-09-05T06:20:06'), item: { name: 'FBB 300 gsm', unit: 'KG' } },
    ];
    world.txns = [{ itemId: 'i1', quantity: 100, createdAt: at('2026-09-05T06:20:01'), createdById: 'p2', isOverIssue: false }, { itemId: 'i1', quantity: 100, createdAt: at('2026-09-05T06:20:04'), createdById: 'p1', isOverIssue: false }];
    const lines = (await getTraceView({ q: 'ORD-2026-118' }, NOW)).issues as { data: { by: string | null }[] };
    expect(lines.data.map((l) => l.by)).toEqual(['R. Kumar', 'S. Patil', null]);
  });

  it('a search that only LOOKS like an order (the database matched a near miss) is not an order', async () => {
    as('OWNER');
    world.orders = [{ ...world.orders[0], orderNumber: 'ORD-2026-118X' }];
    // The fake matches exactly; force a near-miss answer to prove the function verifies it.
    const { db } = await import('@/server/db');
    const spy = vi.spyOn(db.misOrder, 'findFirst').mockResolvedValueOnce(world.orders[0] as never);
    expect((await getTraceView({ q: 'ORD-2026-118' }, NOW)).mode).not.toBe('order');
    spy.mockRestore();
  });

  it('a person id with no profile is unknown (null), not a stranger\'s name', async () => {
    as('OWNER');
    world.profiles = [];
    const v = await getTraceView({ q: 'ORD-2026-118' }, NOW);
    expect(v.order!.raisedBy).toBeNull();
    expect(v.events.every((e) => e.by === null || typeof e.by === 'string')).toBe(true);
    expect(v.events.find((e) => e.kind === 'ORDER_RAISED')!.by).toBeNull();
  });
});

describe('the lot', () => {
  beforeEach(() => {
    world.grnItems = [{
      receivedQty: 2400, batchNo: 'RM-FBB-4417',
      poItem: { itemId: 'i1', item: { name: 'FBB 300 gsm', unit: 'KG' }, description: 'FBB' },
      grn: { grnNumber: 'GRN-1', receivedAt: at('2026-08-21T09:14:00'), receivedById: 'p1', po: { poNumber: 'PO-77', supplier: { name: 'Acme Paper' } } },
    }];
    world.ledger = [
      { itemId: 'i1', changeQty: -1240, createdAt: at('2026-09-05T06:20:00'), sourceId: 'o1', item: { name: 'FBB 300 gsm', unit: 'KG' } },
      { itemId: 'i1', changeQty: -640, createdAt: at('2026-09-06T06:20:00'), sourceId: 'o1', item: { name: 'FBB 300 gsm', unit: 'KG' } },
      { itemId: 'i1', changeQty: -100, createdAt: at('2026-09-07T06:20:00'), sourceId: null, item: { name: 'FBB 300 gsm', unit: 'KG' } },
    ];
  });

  it('finds the receipt by its batch number, ignoring case, with supplier, PO, quantity and who received it', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'rm-fbb-4417' }, NOW);
    expect(v.mode).toBe('lot');
    expect(v.lot!.batchNo).toBe('RM-FBB-4417');
    expect(v.lot!.receipts).toEqual([{ grnNumber: 'GRN-1', poNumber: 'PO-77', supplier: 'Acme Paper', itemName: 'FBB 300 gsm', unit: 'KG', qty: 2400, receivedLabel: '21/08 09:14', by: 'S. Patil' }]);
    expect(v.events).toEqual([expect.objectContaining({ kind: 'RECEIVED', by: 'S. Patil', atLabel: '21/08 09:14' })]);
  });

  it('what the store issued of that ITEM afterwards is listed per order — and is not claimed to be from this lot', async () => {
    as('OWNER');
    const v = await getTraceView({ q: 'RM-FBB-4417' }, NOW);
    const after = v.lot!.issuedAfter as { state: 'ok'; data: { itemName: string; orders: { orderNumber: string; qty: number }[] }[] };
    expect(after.state).toBe('ok');
    expect(after.data[0].orders).toEqual([
      expect.objectContaining({ orderNumber: 'ORD-2026-118', qty: 1880, orderId: 'o1' }),
      expect.objectContaining({ orderNumber: '—', qty: 100, orderId: null }), // an issue booked to a department, not an order
    ]);
    expect(JSON.stringify(v)).not.toMatch(/accounted|contained|used this lot/i);
  });

  it('the lot view never names an order the caller may not see (the D4 seam)', async () => {
    as('OWNER');
    world.visible = { createdById: 'someone-else' };
    world.orders = [{ ...world.orders[0], createdById: 'p4' }];
    const v = await getTraceView({ q: 'RM-FBB-4417' }, NOW);
    const after = v.lot!.issuedAfter as { data: { orders: { orderNumber: string }[] }[] };
    expect(JSON.stringify(after)).not.toContain('ORD-2026-118');
    expect(after.data[0].orders.map((o) => o.orderNumber)).toEqual(['—']); // only the issue that was never booked to an order
  });

  it('a near miss returned by the database (a wildcard-style match) is not a lot', async () => {
    as('OWNER');
    const { db } = await import('@/server/db');
    const spy = vi.spyOn(db.misGrnItem, 'findMany').mockResolvedValueOnce([{ ...world.grnItems[0], batchNo: 'RM-FBB-4417-X' }] as never);
    expect((await getTraceView({ q: 'RM-FBB-4417' }, NOW)).mode).toBe('none');
    spy.mockRestore();
  });

  it('a batch search only matches a batch number that IS the search', async () => {
    as('OWNER');
    world.grnItems[0].batchNo = 'RM-FBB-4417-X';
    expect((await getTraceView({ q: 'RM-FBB-4417' }, NOW)).mode).toBe('none');
  });

  it('an order number wins over a lot when both could match', async () => {
    as('OWNER');
    world.grnItems[0].batchNo = 'ORD-2026-118';
    expect((await getTraceView({ q: 'ORD-2026-118' }, NOW)).mode).toBe('order');
  });
});
