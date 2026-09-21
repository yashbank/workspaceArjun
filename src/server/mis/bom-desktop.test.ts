/**
 * Phase 24C · D6 — BOM costing at the SERVER FUNCTION.
 *
 * D6 shows RUPEES, so this file is where the money rule (D24) is enforced, role by role:
 *
 *   - `getBomCosting` is `wages.read` — Owner only. All seven other roles are refused at the
 *     function, including ADMIN, who holds `orders.write` and can edit a BOM but may not see what
 *     it costs. A refused caller triggers no query at all.
 *   - `getBomDesktopView` is what the screen is handed. For every role that can open it but may
 *     not see money, the payload contains NO money field — not blanked, not null: absent. That is
 *     asserted on the serialised payload, and asking for `costing: true` changes nothing.
 *   - The arithmetic is D6's own picture: a total with one unpriced item is a FLOOR.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: { table: string; args: Row }[] = [];
const world: { bom: Row | null; order: Row | null } = { bom: null, order: null };

vi.mock('@/server/db', () => ({
  db: {
    misBom: { findUnique: async (args: Row) => { queries.push({ table: 'bom', args }); return world.bom; } },
    misOrder: { findUnique: async (args: Row) => { queries.push({ table: 'order', args }); return world.order; } },
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const { getBomCosting } = await import('./bom');
const { getBomDesktopView } = await import('./bom-desktop');

const OWNER_ONLY: MisRoleName = 'OWNER';
const NON_OWNER = MIS_ROLES.filter((r) => r !== OWNER_ONLY);
const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC']; // hold orders.read
const NON_OWNER_READERS = READERS.filter((r) => r !== 'OWNER');
const NON_READERS = MIS_ROLES.filter((r) => !READERS.includes(r));

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

const mat = (id: string, description: string, quantity: number, unit: string, ratePerUnit: number | null, seq = 0) => ({
  id, description, quantity, unit, ratePerUnit, seq, item: null,
});

/** D6's tree: a printed sheet, lamination, and an outer carton with NO recorded rate. */
function seed() {
  world.order = { id: 'o1', orderNumber: 'ORD-2026-118', description: 'Duplex carton', status: 'IN_PROGRESS', customer: null };
  world.bom = {
    id: 'b1', orderId: 'o1', status: 'APPROVED', approvedAt: new Date('2026-09-05T06:00:00Z'),
    stages: [
      { id: 's1', stageName: 'Printed sheet', seq: 0, process: null, materials: [
        mat('m1', 'FBB board 300 gsm', 1240, 'Kg', 159.35, 0),
        mat('m2', 'Process ink · CMYK', 24.8, 'Kg', 1680, 1),
      ] },
      { id: 's2', stageName: 'Lamination', seq: 1, process: null, materials: [mat('m3', 'BOPP matt 12 micron', 1280, 'm²', 50, 0)] },
      { id: 's3', stageName: 'Outer', seq: 2, process: null, materials: [mat('m4', 'Outer carton · 100s', 400, 'Nos', null, 0)] },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  seed();
});

describe('getBomCosting — Owner only (D24), asserted for all eight roles', () => {
  it('the OWNER receives the rolled-up figures as FORMATTED strings, computed on the server', async () => {
    as('OWNER');
    const c = (await getBomCosting('o1'))!;
    expect(c.total).toBe('₹3,03,258'); // 1,97,594 + 41,664 + 64,000 — the unpriced carton adds nothing
    expect(c.materials.m1).toBe('₹1,97,594');
    expect(c.materials.m2).toBe('₹41,664');
    expect(c.materials.m3).toBe('₹64,000');
    expect(c.stages.s1).toEqual({ subtotal: '₹2,39,258', unpriced: 0 });
    for (const v of Object.values(c.materials)) expect(typeof v === 'string' || v === null).toBe(true); // never a number
  });

  it('"not priced" is a fact: the carton is null, its stage has no subtotal, and the total is a FLOOR', async () => {
    as('OWNER');
    const c = (await getBomCosting('o1'))!;
    expect(c.materials.m4).toBeNull();
    expect(c.stages.s3).toEqual({ subtotal: null, unpriced: 1 }); // never "₹0"
    expect(JSON.stringify(c.stages.s3)).not.toContain('₹0');
    expect(c).toMatchObject({ unpriced: 1, priced: 3, isFloor: true });
  });

  it('a rate recorded as 0 is a real figure, priced at ₹0 — distinct from no rate at all', async () => {
    as('OWNER');
    (world.bom!.stages as Row[])[2].materials = [mat('m4', 'Free-issue carton', 400, 'Nos', 0)];
    const c = (await getBomCosting('o1'))!;
    expect(c.materials.m4).toBe('₹0');
    expect(c.stages.s3).toEqual({ subtotal: '₹0', unpriced: 0 });
    expect(c.isFloor).toBe(false);
  });

  it('with every line priced the total is the figure, not a floor', async () => {
    as('OWNER');
    (world.bom!.stages as Row[])[2].materials = [mat('m4', 'Outer carton', 400, 'Nos', 2)];
    expect((await getBomCosting('o1'))!.isFloor).toBe(false);
  });

  it('an order with no BOM answers null', async () => {
    as('OWNER');
    world.bom = null;
    expect(await getBomCosting('o1')).toBeNull();
  });

  it.each(NON_OWNER)('%s is REFUSED at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getBomCosting('o1'))).toBe(true);
    expect(queries).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => getBomCosting('o1'))).toBe(true);
    expect(queries).toEqual([]);
  });
});

describe('getBomDesktopView — the payload a screen is handed', () => {
  // Every word that would betray money in a key or a value. "unpriced" and "floor" count.
  const MONEY = /cost|subtotal|unpriced|price|rate|₹|rupee|amount|wage|floor|total/i;
  /** A boolean capability flag (`canCost: false`) says what you MAY NOT see; it is not money. */
  const withoutFlags = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(withoutFlags)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).filter(([k, x]) => !(/^can[A-Z]/.test(k) && typeof x === 'boolean')).map(([k, x]) => [k, withoutFlags(x)]))
        : v;

  it('OWNER: the same tree WITH the cost column, stage subtotals and the rolled-up total', async () => {
    as('OWNER');
    const v = (await getBomDesktopView('o1'))!;
    expect(v.canCost).toBe(true);
    expect(v.costing).toEqual({ total: '₹3,03,258', priced: 3, unpriced: 1, isFloor: true });
    expect(v.stages[0].materials.map((m) => m.cost)).toEqual(['₹1,97,594', '₹41,664']);
    expect(v.stages[0].subtotal).toBe('₹2,39,258');
    expect(v.stages[2].materials[0].cost).toBeNull(); // not priced
    expect(v.stages[2].subtotal).toBeNull();
  });

  it('OWNER with costing OFF: the column is dropped and NOTHING is fetched for it — a refetch without, not a hide', async () => {
    as('OWNER');
    const v = (await getBomDesktopView('o1', { costing: false }))!;
    expect(v.canCost).toBe(true); // the toggle still exists, so it can be turned back on
    expect(v).not.toHaveProperty('costing');
    for (const s of v.stages) {
      expect(s).not.toHaveProperty('subtotal');
      expect(s).not.toHaveProperty('unpriced');
      for (const m of s.materials) expect(m).not.toHaveProperty('cost');
    }
    expect(JSON.stringify(v)).not.toContain('₹');
  });

  it('the structure is IDENTICAL with and without costing — an extra column, not a different screen', async () => {
    as('OWNER');
    const on = (await getBomDesktopView('o1', { costing: true }))!;
    const off = (await getBomDesktopView('o1', { costing: false }))!;
    const strip = (v: typeof on) => v.stages.map((s) => ({ id: s.id, name: s.name, rows: s.materials.map((m) => [m.id, m.description, m.quantity, m.unit]) }));
    expect(strip(on)).toEqual(strip(off));
  });

  it.each(NON_OWNER_READERS)('%s: the payload carries NO money field of any kind — absent, not blank', async (role) => {
    as(role);
    const v = (await getBomDesktopView('o1', { costing: true }))!; // even when it ASKS for costing
    expect(v.canCost).toBe(false);
    expect(v).not.toHaveProperty('costing');
    const text = JSON.stringify(withoutFlags(v));
    expect(text).not.toMatch(MONEY);
    for (const s of v.stages) {
      expect(Object.keys(s).sort()).toEqual(['id', 'materials', 'name']);
      for (const m of s.materials) expect(Object.keys(m).sort()).toEqual(['description', 'id', 'quantity', 'unit']);
    }
  });

  it.each(NON_OWNER_READERS)('%s: no rate VALUE leaks either (159.35, 1680, 50)', async (role) => {
    as(role);
    const text = JSON.stringify(await getBomDesktopView('o1', { costing: true }));
    for (const rate of ['159.35', '1680', '"50"']) expect(text).not.toContain(rate);
  });

  it.each(NON_OWNER_READERS)('%s: the costing function is never even asked — no query selects a rate for them', async (role) => {
    as(role);
    await getBomDesktopView('o1', { costing: true });
    // The costing query is the only one with a TOP-LEVEL `select` (the structure query uses `include`).
    const costingQueries = queries.filter((q) => q.table === 'bom' && q.args.select !== undefined);
    expect(costingQueries).toEqual([]);
  });

  it.each(NON_OWNER_READERS)('%s: quantities ARE all there (so the absence above is not an empty tree)', async (role) => {
    as(role);
    const v = (await getBomDesktopView('o1'))!;
    expect(v.itemCount).toBe(4);
    expect(v.stages[0].materials[0]).toEqual({ id: 'm1', description: 'FBB board 300 gsm', quantity: '1,240', unit: 'Kg' });
  });

  it.each(NON_READERS)('%s (no orders.read) is refused at the function, before any query', async (role) => {
    as(role);
    expect(await denied(() => getBomDesktopView('o1'))).toBe(true);
    expect(queries).toEqual([]);
  });

  it('who may EDIT is separate from who may see cost: ADMIN edits but cannot cost; SUPERVISOR and QC do neither', async () => {
    const edit = async (role: MisRoleName) => { as(role); return (await getBomDesktopView('o1'))!.canEdit; };
    expect(await edit('OWNER')).toBe(true);
    expect(await edit('ADMIN')).toBe(true);
    expect(await edit('SUPERVISOR')).toBe(false);
    expect(await edit('QC')).toBe(false);
    as('ADMIN');
    expect((await getBomDesktopView('o1'))!.canCost).toBe(false);
  });

  it('headline facts: item count, approval date in the factory zone, status', async () => {
    as('OWNER');
    const v = (await getBomDesktopView('o1'))!;
    expect(v).toMatchObject({ orderNumber: 'ORD-2026-118', bomStatus: 'APPROVED', approvedLabel: '05/09', itemCount: 4 });
  });

  it('a BOM that was never approved has no approval date, not "01/01"', async () => {
    as('OWNER');
    world.bom!.approvedAt = null;
    world.bom!.status = 'DRAFT';
    expect((await getBomDesktopView('o1'))!.approvedLabel).toBeNull();
  });

  it('an order with no BOM, or no such order, answers null', async () => {
    as('OWNER');
    world.bom = null;
    expect(await getBomDesktopView('o1')).toBeNull();
    seed();
    world.order = null;
    expect(await getBomDesktopView('o1')).toBeNull();
  });
});
