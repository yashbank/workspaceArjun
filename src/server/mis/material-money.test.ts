/**
 * Phase 24D · F-06 — material prices are Owner-only at the SERVER FUNCTION (D24).
 *
 * `ratePerUnit` (a BOM or PO line) and `pricePerUnit` (a stock item) are money. The screens hid
 * them behind `isOwner`, but a hidden column is still in the payload. This file closes every
 * remaining route to them, role by role, all eight roles each time:
 *
 *   - `getPO`, `getGRN` (a GRN carries its PO's lines), `listItems` / `getItem` / `searchItems`
 *     serve their usual readers WITHOUT the price key — absent, not null, not blank.
 *   - `computePoTotal` IS money, so it is `wages.read`: all seven non-Owner roles are refused and
 *     nothing is queried.
 *   - Audit rows: a price written by `addBomMaterial`, `addPOItem` or `updatePOItem` is redacted in
 *     the STORED row — the audit page is readable by Admin (`settings.read`).
 *
 * (`getBom` and `getOrderTrace` are in wage-leak.test.ts / traceability-money.test.ts;
 * `getStoreReport` is in wage-leak.test.ts.) Every probe runs as OWNER first, so "no price" for
 * the others cannot mean "the fixture carried none".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: string[] = [];
const auditRows: Row[] = [];

const RATE = 731.19; // odd on purpose: an exact-value match cannot be a coincidence
const PRICE = 88.41;

const poItem = { id: 'pi1', poId: 'po1', itemId: 'i1', description: 'Kraft', quantity: 10, receivedQuantity: 0, ratePerUnit: RATE, sortOrder: 1, item: { id: 'i1', name: 'Kraft', unit: 'KG' } };
const world = {
  po: { id: 'po1', poNumber: 'PO-1', status: 'APPROVED', supplier: { id: 's1', name: 'Acme' }, items: [poItem], grns: [] } as Row,
  grn: { id: 'g1', grnNumber: 'GRN-1', po: { id: 'po1', poNumber: 'PO-1', items: [poItem] }, items: [{ id: 'gi1', poItem }] } as Row,
  items: [{ id: 'i1', code: 'K1', name: 'Kraft', unit: 'KG', pricePerUnit: PRICE, deletedAt: null }] as Row[],
};

const q = (name: string, value: unknown) => async () => { queries.push(name); return value; };

vi.mock('@/server/db', () => ({
  db: {
    misPurchaseOrder: { findUnique: async () => { queries.push('po'); return world.po; } },
    misGrn: { findUnique: async () => { queries.push('grn'); return world.grn; } },
    misItem: {
      findMany: async () => { queries.push('items'); return world.items; },
      findUnique: async () => { queries.push('item'); return world.items[0]; },
      create: async ({ data }: { data: Row }) => ({ id: 'i2', pricePerUnit: PRICE, ...data }),
      update: async ({ data }: { data: Row }) => ({ ...world.items[0], ...data }),
    },
    misPoItem: {
      // computePoTotal does its sums on Prisma Decimals, so this one table returns Decimal-shaped values.
      findMany: q('poItems', [{ ...poItem, quantity: { toNumber: () => 10 }, ratePerUnit: { toNumber: () => RATE } }]),
      findFirst: q('poItemLast', { sortOrder: 1 }),
      findUnique: q('poItemOne', poItem),
      create: async ({ data }: { data: Row }) => ({ id: 'pi2', ...data }),
      update: async ({ data }: { data: Row }) => ({ ...poItem, ...data }),
      delete: async () => poItem,
    },
    misBomMaterial: { create: async ({ data }: { data: Row }) => ({ id: 'm9', ...data }) },
    misAuditLog: { create: async ({ data }: { data: Row }) => { auditRows.push(JSON.parse(JSON.stringify(data))); return data; } },
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { getPO, computePoTotal, addPOItem, updatePOItem, removePOItem } = await import('./po');
const { getGRN } = await import('./grn');
const { listItems, getItem, searchItems, createItem, updateItem, deleteItem, restoreItem } = await import('./item');
const { addBomMaterial } = await import('./bom');

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
const NON_OWNER = MIS_ROLES.filter((r) => r !== 'OWNER');
const split = (readers: MisRoleName[]) => ({
  served: readers.filter((r) => r !== 'OWNER'),
  refused: NON_OWNER.filter((r) => !readers.includes(r)),
});

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  auditRows.length = 0;
});

/** One reader: who may open it, what it hands back, and the price it must not carry. */
const READERS: { name: string; readers: MisRoleName[]; run: () => Promise<unknown>; price: number; key: string }[] = [
  { name: 'getPO', readers: ['OWNER', 'ADMIN', 'STORE_GUY'], run: () => getPO('po1'), price: RATE, key: 'ratePerUnit' },
  { name: 'getGRN', readers: ['OWNER', 'ADMIN', 'SUPERVISOR', 'STORE_GUY'], run: () => getGRN('g1'), price: RATE, key: 'ratePerUnit' },
  { name: 'listItems', readers: ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'], run: () => listItems(), price: PRICE, key: 'pricePerUnit' },
  { name: 'getItem', readers: ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'], run: () => getItem('i1'), price: PRICE, key: 'pricePerUnit' },
  { name: 'searchItems', readers: ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'], run: () => searchItems('kra'), price: PRICE, key: 'pricePerUnit' },
];

describe.each(READERS)('$name — the price is Owner-only', ({ readers, run, price, key }) => {
  const { served, refused } = split(readers);

  it('the OWNER receives it (so an absent price below means the role, not the fixture)', async () => {
    as('OWNER');
    const text = JSON.stringify(await run());
    expect(text).toContain(key);
    expect(text).toContain(String(price));
  });

  it.each(served)('%s is served the record with NO price key — absent, not null', async (role) => {
    as(role);
    const value = await run();
    const text = JSON.stringify(value);
    expect(text).not.toContain(key);
    expect(text).not.toContain(String(price));
    expect(text).not.toMatch(/ratePerUnit|pricePerUnit/);
    expect(text.length).toBeGreaterThan(40); // a real record, not an empty answer that passes by having nothing
  });

  it.each(refused)('%s (cannot read this at all) is refused, with no query', async (role) => {
    as(role);
    expect(await denied(run)).toBe(true);
    expect(queries).toEqual([]);
  });
});

describe('the rest of each record survives the withholding', () => {
  it('getPO keeps the lines, their quantities and the supplier', async () => {
    as('ADMIN');
    const po = (await getPO('po1'))!;
    expect(po.items[0]).toMatchObject({ description: 'Kraft', quantity: 10, receivedQuantity: 0 });
    expect(po.supplier).toMatchObject({ name: 'Acme' });
  });

  it('getGRN keeps both the PO lines and the received lines', async () => {
    as('STORE_GUY');
    const grn = (await getGRN('g1'))!;
    expect(grn.po.items[0].description).toBe('Kraft');
    expect(grn.items[0].poItem.description).toBe('Kraft');
  });

  it('withholding does not change the stored rows — the Owner reading afterwards still sees the price', async () => {
    as('ADMIN');
    await getPO('po1');
    await listItems();
    as('OWNER');
    expect(JSON.stringify(await getPO('po1'))).toContain(String(RATE));
    expect(JSON.stringify(await listItems())).toContain(String(PRICE));
  });
});

describe('computePoTotal — a PO total is money, so it is wages.read', () => {
  it('the OWNER gets the total, formatted on the server', async () => {
    as('OWNER');
    expect(await computePoTotal('po1')).toBe('₹7,311.90');
  });

  it.each(NON_OWNER)('%s is REFUSED at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => computePoTotal('po1'))).toBe(true);
    expect(queries).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => computePoTotal('po1'))).toBe(true);
  });
});

describe('audit — a price written by a builder is redacted in the STORED row (D24)', () => {
  const stored = () => JSON.stringify(auditRows.map((r) => [r.before, r.after]));

  it('addBomMaterial: the new line is audited, its rate is not', async () => {
    as('OWNER');
    await addBomMaterial('s1', { description: 'Ink', quantity: 2, unit: 'KG', ratePerUnit: RATE, seq: 0 });
    expect(auditRows).toHaveLength(1);
    expect(stored()).not.toContain(String(RATE));
    expect(auditRows[0].after).toMatchObject({ description: 'Ink', ratePerUnit: '[redacted]' });
    expect(auditRows[0].action).toBe('ADD_BOM_MATERIAL');
  });

  it('addPOItem and updatePOItem: neither the old nor the new rate is audited', async () => {
    as('ADMIN');
    await addPOItem('po1', { description: 'Glue', quantity: 1, ratePerUnit: 555.55 });
    await updatePOItem('pi1', { ratePerUnit: 999.99 });
    expect(auditRows).toHaveLength(2);
    expect(stored()).not.toMatch(/555\.55|999\.99/);
    expect(stored()).not.toContain(String(RATE)); // the OLD rate, in `before`
    expect(auditRows[1].before).toMatchObject({ description: 'Kraft', ratePerUnit: '[redacted]' });
    expect(auditRows[1].after).toMatchObject({ ratePerUnit: '[redacted]' });
  });

  it('the audit row is still a row — the safe fields are recorded', async () => {
    as('ADMIN');
    await addPOItem('po1', { description: 'Glue', quantity: 3, ratePerUnit: 1 });
    expect(auditRows[0]).toMatchObject({ action: 'po_item.create', entity: 'MisPoItem' });
    expect(auditRows[0].after).toMatchObject({ description: 'Glue', quantity: 3 });
  });
});

describe('the WRITE functions do not hand the price back to a role that may not read it', () => {
  // A person who may edit a PO line or an item (Admin) must not get the Owner's price back from an
  // update that did not touch it — `updateItem(id, {})` is enough to read a stock price otherwise.
  const WRITES: { name: string; role: MisRoleName; run: () => Promise<unknown>; price: number }[] = [
    { name: 'addPOItem', role: 'ADMIN', run: () => addPOItem('po1', { description: 'Glue', quantity: 1, ratePerUnit: 555.55 }), price: 555.55 },
    { name: 'updatePOItem', role: 'ADMIN', run: () => updatePOItem('pi1', { description: 'x' }), price: RATE },
    { name: 'removePOItem', role: 'ADMIN', run: () => removePOItem('pi1'), price: RATE },
    { name: 'createItem', role: 'ADMIN', run: () => createItem({ code: 'n1', name: 'New' }), price: PRICE },
    { name: 'updateItem', role: 'ADMIN', run: () => updateItem('i1', {}), price: PRICE },
    { name: 'deleteItem', role: 'ADMIN', run: () => deleteItem('i1'), price: PRICE },
    { name: 'restoreItem', role: 'ADMIN', run: () => restoreItem('i1'), price: PRICE },
    { name: 'addBomMaterial', role: 'ADMIN', run: () => addBomMaterial('s1', { description: 'Ink', quantity: 1, unit: 'KG', ratePerUnit: 42.42, seq: 0 }), price: 42.42 },
  ];

  it.each(WRITES)('$name returns the ADMIN the row without its price key', async ({ role, run, price }) => {
    as(role);
    const text = JSON.stringify(await run());
    expect(text).not.toMatch(/ratePerUnit|pricePerUnit/);
    expect(text).not.toContain(String(price));
    expect(text.length).toBeGreaterThan(20);
  });

  it.each(WRITES)('$name still returns the OWNER the price (so the absence above is the role)', async ({ run, price }) => {
    as('OWNER');
    expect(JSON.stringify(await run())).toContain(String(price));
  });
});
