/**
 * Phase 24C · F-06 — `getOrderTrace` carries a BOM tree, so it carries the same rule as `getBom`:
 * a material's `ratePerUnit` is money (D24) and only a role holding `wages.read` receives it.
 * Found by the D6 check: the trace did its own `misBom` query and handed ADMIN, SUPERVISOR and QC
 * every rate, one route round the fix in `getBom`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const world: { bom: Row | null } = { bom: null };
const queried: string[] = [];

vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findUnique: async () => ({ id: 'o1', orderNumber: 'ORD-1', customer: null }) },
    misBom: { findUnique: async () => world.bom },
    misProductionLog: { findMany: async () => [] },
    misQcCheck: { findMany: async () => [] },
    misDocument: { findMany: async () => [] },
    // C3 (#35): the purchasing + store legs. The fakes carry money on purpose; the real selects must not ask for it.
    misPurchaseOrder: {
      findMany: async () => {
        queried.push('po');
        return [{ poNumber: 'PO-1', status: 'PARTIAL', supplier: { name: 'Acme' }, grns: [{ grnNumber: 'GRN-1', status: 'CONFIRMED', receivedAt: new Date('2026-10-01T00:00:00Z'), items: [{ receivedQty: 40, poItem: { description: 'Board', item: { name: 'FBB', unit: 'KG' } } }] }] }];
      },
    },
    misInventoryLedger: {
      findMany: async () => { queried.push('ledger'); return [{ itemId: 'i1', changeQty: -25, createdAt: new Date('2026-10-02T00:00:00Z'), item: { name: 'FBB', unit: 'KG' } }]; },
    },
    misStoreTransaction: {
      findMany: async () => {
        queried.push('txn');
        return [
          { itemId: 'i1', quantity: 25, createdAt: new Date('2026-10-02T00:00:00Z'), item: { name: 'FBB', unit: 'KG' } }, // same issue as the ledger row
          { itemId: 'i2', quantity: 3, createdAt: new Date('2026-10-03T00:00:00Z'), item: { name: 'Ink', unit: 'KG' } }, // book-only
        ];
      },
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/qc', () => ({ withCheckerNames: async (rows: unknown[]) => rows }));
vi.mock('@/server/mis/documents', () => ({ withUploaderNames: async (rows: unknown[]) => rows }));

const { getOrderTrace } = await import('./traceability');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC', 'STORE_GUY']; // R3 B64: STORE_GUY holds orders.read
const RATE = 159.35;
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

beforeEach(() => {
  vi.clearAllMocks();
  queried.length = 0;
  world.bom = {
    id: 'b1', status: 'APPROVED',
    stages: [{ id: 's1', stageName: 'Print', seq: 0, process: null, materials: [
      { id: 'm1', description: 'FBB board', quantity: 1240, unit: 'Kg', ratePerUnit: RATE, seq: 0, item: null },
    ] }],
  };
});

describe('getOrderTrace — the BOM rate is Owner-only (F-06)', () => {
  it('the OWNER still receives the rate', async () => {
    as('OWNER');
    const t = await getOrderTrace('o1');
    expect((t.bom!.stages[0].materials[0] as Row).ratePerUnit).toBe(RATE);
  });

  it.each(READERS.filter((r) => r !== 'OWNER'))('%s gets the structure and quantities but NO rate — the key is absent', async (role) => {
    as(role);
    const t = await getOrderTrace('o1');
    const material = t.bom!.stages[0].materials[0] as Row;
    expect(material).toMatchObject({ description: 'FBB board', quantity: 1240, unit: 'Kg' });
    expect('ratePerUnit' in material).toBe(false);
    expect(JSON.stringify(t)).not.toContain(String(RATE));
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is refused outright', async (role) => {
    as(role);
    await expect(getOrderTrace('o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });

  it('an order with no BOM still answers (bom: null) for every reader', async () => {
    world.bom = null;
    for (const role of READERS) {
      as(role);
      expect((await getOrderTrace('o1')).bom).toBeNull();
    }
  });
});

// ---- C3 · #35 — the trace also carries the PO, its GRNs and the material issued; D6 keeps QC out ----------------------

const MONEY = /rate|price|amount|invoice|value|cost|total|₹|wage|salary/i;
const moneyKeys = (v: unknown, path = ''): string[] =>
  Array.isArray(v)
    ? v.flatMap((x, i) => moneyKeys(x, `${path}[${i}]`))
    : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
      ? Object.entries(v).flatMap(([k, x]) => [...(MONEY.test(k) && !/^total(Produced|Waste)$/.test(k) ? [`${path}.${k}`] : []), ...moneyKeys(x, `${path}.${k}`)])
      : [];

describe('getOrderTrace — PO, GRN and issued material (#35)', () => {
  it('the OWNER and ADMIN see the PO header, its GRN lines and the deduplicated issued list', async () => {
    for (const role of ['OWNER', 'ADMIN'] as MisRoleName[]) {
      as(role);
      const t = await getOrderTrace('o1');
      expect(t.purchaseOrders).toMatchObject([{ poNumber: 'PO-1', status: 'PARTIAL', supplierName: 'Acme', grns: [{ grnNumber: 'GRN-1', lines: [{ itemName: 'FBB', receivedQty: 40 }] }] }]);
      // the ledger row and the matching store-book row are ONE issue; the Ink row is book-only and is kept
      expect(t.issuedMaterials!.map((m) => [m.itemName, m.qty])).toEqual([['FBB', 25], ['Ink', 3]]);
    }
  });

  it('SUPERVISOR (grn.read + store.read, no po.read) sees the issued list but no PO block', async () => {
    as('SUPERVISOR');
    const t = await getOrderTrace('o1');
    expect(t.purchaseOrders).toBeNull();
    expect(t.issuedMaterials).toHaveLength(2);
  });

  it('QC gets neither leg, and no purchasing or store table is even queried (D6)', async () => {
    as('QC');
    const t = await getOrderTrace('o1');
    expect(t.purchaseOrders).toBeNull();
    expect(t.issuedMaterials).toBeNull();
    expect(queried).toEqual([]);
  });

  it('the new PO / GRN / issued legs carry no money even for the OWNER (quantities only)', async () => {
    as('OWNER');
    const t = await getOrderTrace('o1');
    expect(moneyKeys({ po: t.purchaseOrders, issued: t.issuedMaterials })).toEqual([]);
  });

  it.each(READERS.filter((r) => r !== 'OWNER'))('%s: no money key exists at any depth of the payload', async (role) => {
    as(role);
    expect(moneyKeys(await getOrderTrace('o1'))).toEqual([]);
  });

  it.each(READERS.filter((r) => r !== 'OWNER'))('%s: the serialised payload carries no rupee figure', async (role) => {
    as(role);
    const text = JSON.stringify(await getOrderTrace('o1'));
    expect(text).not.toContain(String(RATE));
    expect(text).not.toContain('₹');
  });
});
