/**
 * R2-411..414: the four opt-in dashboard widgets at the server function. Each gates on its own
 * permission, returns a plain JSON-safe payload (no Decimal, no Date), carries no money, and the
 * scrap rate never adds one unit to another.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';
import type { KeyRange } from '@/lib/mis/report-range';

class Dec {
  constructor(private n: number) {}
  toString() { return String(this.n); }
  valueOf() { return this.n; }
}

const world = {
  role: 'OWNER' as MisRoleName,
  items: [] as Record<string, unknown>[],
  ledger: [] as { item_id: string; balance_qty: unknown }[],
  pos: [] as Record<string, unknown>[],
  grns: [] as Record<string, unknown>[],
  orders: [] as { status: string; bom: { status: string } | null }[],
  logs: [] as Record<string, unknown>[],
};

const matchBom = (o: { bom: { status: string } | null }, w: { bom?: null | { status: string } }) =>
  w.bom === undefined ? true : w.bom === null ? o.bom === null : o.bom?.status === w.bom.status;

vi.mock('@/server/db', () => ({
  db: {
    misItem: { findMany: async () => world.items },
    $queryRaw: async () => world.ledger,
    misPurchaseOrder: { findMany: async () => world.pos },
    misGrn: { findMany: async () => world.grns },
    misOrder: { count: async ({ where }: { where: { bom?: null | { status: string } } }) => world.orders.filter((o) => matchBom(o, where)).length },
    misProductionLog: { findMany: async () => world.logs },
  },
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => world.role }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata', getAqlThresholds: async () => ({}) }));

const { getBomPipeline, getLowStockAlerts, getPoFulfilment } = await import('./dashboard-widgets');
const { getRangeScrapRate } = await import('./range-metrics');

const item = (id: string, name: string, reorderLevel: number) => ({ id, code: `C-${id}`, name, unit: 'KG', reorderLevel: new Dec(reorderLevel) });
const plain = (v: unknown) => JSON.stringify(v, (_k, x) => x);
const isPlain = (v: unknown): boolean => JSON.stringify(v) === plain(JSON.parse(JSON.stringify(v)));
const NO_MONEY = /rate|price|amount|cost|value|rupee|inr|wage/i;
const keysDeep = (v: unknown): string[] =>
  v && typeof v === 'object' ? Object.entries(v as object).flatMap(([k, x]) => [k, ...keysDeep(x)]) : [];

const NOV: KeyRange = { freq: 'month', at: '2026-11-01', fromKey: '2026-11-01', toKey: '2026-12-01', label: 'Nov 2026', days: 30, prevAt: '', nextAt: '' } as KeyRange;
const log = (day: string, qtyProduced: number, qtyWaste: number, unit: string) => ({ loggedAt: new Date(`${day}T06:00:00Z`), qtyProduced: new Dec(qtyProduced), qtyWaste: new Dec(qtyWaste), unit });

beforeEach(() => {
  world.role = 'OWNER';
  world.items = [];
  world.ledger = [];
  world.pos = [];
  world.grns = [];
  world.orders = [];
  world.logs = [];
});

async function refused(call: () => Promise<unknown>) {
  try { await call(); return false; } catch (e) { return (e as Error).name === 'MisForbiddenError'; }
}

describe.each([
  ['getLowStockAlerts', 'inventory.read', () => getLowStockAlerts()],
  ['getPoFulfilment', 'po.read', () => getPoFulfilment()],
  ['getBomPipeline', 'orders.read', () => getBomPipeline()],
  ['getRangeScrapRate', 'production.read', () => getRangeScrapRate(NOV)],
] as const)('%s gates on %s', (_name, action, call) => {
  it.each(MIS_ROLES)('%s', async (role) => {
    world.role = role;
    expect(await refused(call)).toBe(!can(role, action));
  });
});

describe('getLowStockAlerts', () => {
  it('counts items at or below reorder level, lists the five lowest, as plain numbers', async () => {
    world.items = [item('a', 'Kraft', 100), item('b', 'Glue', 10), item('c', 'Ink', 10), item('d', 'Film', 5), item('e', 'Tape', 5), item('f', 'Core', 5), item('g', 'Fine', 5)];
    world.ledger = [
      { item_id: 'a', balance_qty: new Dec(100) }, // exactly at level: included
      { item_id: 'b', balance_qty: new Dec(2) },
      { item_id: 'c', balance_qty: new Dec(9) },
      { item_id: 'd', balance_qty: new Dec(1) },
      { item_id: 'e', balance_qty: new Dec(3) },
      // f has no ledger row: balance 0
      { item_id: 'g', balance_qty: new Dec(50) }, // healthy
    ];
    const r = await getLowStockAlerts();
    expect(r.count).toBe(6);
    expect(r.top.map((i) => i.name)).toEqual(['Core', 'Film', 'Glue', 'Tape', 'Ink']);
    expect(r.top[0]).toEqual({ id: 'f', code: 'C-f', name: 'Core', unit: 'KG', balance: 0, reorderLevel: 5 });
    expect(typeof r.top[1].balance).toBe('number');
    expect(isPlain(r)).toBe(true);
    expect(keysDeep(r).filter((k) => NO_MONEY.test(k) && k !== 'reorderLevel')).toEqual([]);
  });

  it('is empty when nothing is low', async () => {
    world.items = [item('a', 'Kraft', 10)];
    world.ledger = [{ item_id: 'a', balance_qty: 99 }];
    expect(await getLowStockAlerts()).toEqual({ count: 0, top: [] });
  });
});

describe('getPoFulfilment', () => {
  it('counts pending POs, those past their promised date, and distinct POs received this month', async () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const future = new Date('2099-01-01T00:00:00Z');
    world.pos = [{ deliveryDueDate: past }, { deliveryDueDate: future }, { deliveryDueDate: null }];
    world.grns = [{ poId: 'p1' }, { poId: 'p1' }, { poId: 'p2' }];
    const r = await getPoFulfilment();
    expect(r).toMatchObject({ pending: 3, overdue: 1, receivedThisMonth: 2, grnsThisMonth: 3 });
    expect(typeof r.monthLabel).toBe('string');
    expect(isPlain(r)).toBe(true);
    expect(keysDeep(r).filter((k) => NO_MONEY.test(k))).toEqual([]);
  });

  it('needs grn.read as well as po.read', async () => {
    // Every role holding po.read also holds grn.read today; the double gate is the guard if that ever changes.
    for (const role of MIS_ROLES) {
      world.role = role;
      expect(await refused(() => getPoFulfilment())).toBe(!(can(role, 'po.read') && can(role, 'grn.read')));
    }
  });
});

describe('getBomPipeline', () => {
  it('counts open orders with no BOM, a draft BOM and a BOM pending approval', async () => {
    world.orders = [
      { status: 'CONFIRMED', bom: null },
      { status: 'DRAFT', bom: null },
      { status: 'CONFIRMED', bom: { status: 'DRAFT' } },
      { status: 'CONFIRMED', bom: { status: 'PENDING_APPROVAL' } },
      { status: 'CONFIRMED', bom: { status: 'APPROVED' } },
    ];
    const r = await getBomPipeline();
    expect(r).toEqual({ noBom: 2, draft: 1, pendingApproval: 1 });
    expect(isPlain(r)).toBe(true);
  });
});

describe('getRangeScrapRate', () => {
  it('is waste / (produced + waste) per day, with a null gap for a quiet day', async () => {
    world.logs = [log('2026-11-03', 90, 10, 'KG'), log('2026-11-03', 90, 10, 'KG'), log('2026-11-05', 50, 0, 'KG')];
    const r = await getRangeScrapRate(NOV);
    expect(r.bucket).toBe('day');
    expect(r.unit).toBe('KG');
    expect(r.points).toHaveLength(30);
    const by = Object.fromEntries(r.points.map((p) => [p.label, p.ratePct]));
    expect(by['3 Nov']).toBe(10);
    expect(by['5 Nov']).toBe(0);
    expect(by['4 Nov']).toBeNull();
    expect(r.overallPct).toBe(8); // 20 / (230 + 20)
    expect(isPlain(r)).toBe(true);
  });

  it('never adds a different unit in: it draws the unit with the most output and names the rest', async () => {
    world.logs = [log('2026-11-03', 100, 0, 'KG'), log('2026-11-03', 5, 5, 'PIECE')];
    const r = await getRangeScrapRate(NOV);
    expect(r.unit).toBe('KG');
    expect(r.overallPct).toBe(0);
    expect(r.otherUnits).toEqual(['PIECE']);
  });

  it('switches to week then month buckets for longer ranges', async () => {
    const wide = { ...NOV, freq: 'quarter', fromKey: '2026-10-01', toKey: '2027-01-01', days: 92 } as KeyRange;
    expect((await getRangeScrapRate(wide)).bucket).toBe('week');
    const year = { ...NOV, freq: 'year', fromKey: '2026-01-01', toKey: '2027-01-01', days: 365 } as KeyRange;
    const y = await getRangeScrapRate(year);
    expect(y.bucket).toBe('month');
    expect(y.points).toHaveLength(12);
  });

  it('an empty range has no unit and no rate, not a zero', async () => {
    const r = await getRangeScrapRate(NOV);
    expect(r.unit).toBeNull();
    expect(r.overallPct).toBeNull();
    expect(r.points.every((p) => p.ratePct === null)).toBe(true);
  });
});
