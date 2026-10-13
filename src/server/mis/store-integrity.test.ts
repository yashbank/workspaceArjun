/**
 * F2 — direct-issue integrity, exercised through the real `commitIssue` on a stateful in-memory
 * database whose reads yield to the event loop, so two concurrent calls genuinely interleave
 * (the way idempotency.test.ts makes its race). `$queryRaw` stands in for the advisory lock:
 * a per-key mutex released when the transaction ends.
 *
 *   E. two issues racing for the same stock cannot both pass the balance / order-cap check
 *   F. EQUIPMENT / OTHER can never be booked to an order, and need a department otherwise
 *   H. quantities are rounded to 2 dp BEFORE they are validated
 *   I. a closed order takes no stock
 *   J. the cap throws the typed OrderStockQuotaExceededError, and asResult still shows its words
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asResult } from '@/lib/mis/action-result';
import { OrderStockQuotaExceededError } from '@/lib/mis/order-allocation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const state: { ledger: Row[]; txns: Row[]; allocations: Row[]; order: Row | null; items: Row[]; stamp: number } = {
  ledger: [], txns: [], allocations: [], order: null, items: [], stamp: 0,
};
const kraft = { id: 'i1', name: 'Kraft', code: 'K1', unit: 'KG', category: 'RAW_MATERIAL', isActive: true, deletedAt: null };
const die = { id: 'i2', name: 'Die', code: 'D1', unit: 'NOS', category: 'EQUIPMENT', isActive: true, deletedAt: null };

const mutex = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const prev = mutex.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  mutex.set(key, prev.then(() => mine));
  await prev;
  return release;
}
const stamp = () => new Date(Date.UTC(2026, 9, 1) + ++state.stamp);

function makeDb(): Row {
  const base: Row = {
    misItem: { findMany: async ({ where }: Row) => state.items.filter((i) => where.id.in.includes(i.id)) },
    misOrder: { findUnique: async () => state.order },
    misDepartment: { findUnique: async ({ where }: Row) => (where.id === 'd1' ? { name: 'Press' } : null) },
    misOrderStockAllocation: {
      findMany: async ({ where }: Row) => {
        await tick();
        return state.allocations.filter((a) => a.orderId === where.orderId && where.itemId.in.includes(a.itemId)).map((a) => ({ itemId: a.itemId, allocatedQty: D(a.allocatedQty), createdAt: a.createdAt }));
      },
    },
    misInventoryLedger: {
      findFirst: async ({ where }: Row) => {
        await tick();
        const rows = state.ledger.filter((l) => l.itemId === where.itemId);
        return rows.length ? { balanceQty: D(rows[rows.length - 1].balanceQty) } : null;
      },
      findMany: async ({ where }: Row) => {
        await tick();
        return state.ledger
          .filter((l) => l.source === where.source && l.sourceId === where.sourceId && where.itemId.in.includes(l.itemId))
          .map((l) => ({ itemId: l.itemId, changeQty: D(l.changeQty), createdAt: l.createdAt }));
      },
      create: async ({ data }: Row) => { await tick(); state.ledger.push({ createdAt: stamp(), ...data }); return data; },
    },
    misStoreTransaction: {
      // R3-STK B08: per item, and by txn-number prefix when asked (the daily sequence).
      findFirst: async ({ where }: Row = {}) => {
        await tick();
        const rows = state.txns.filter((t) => (where?.itemId ? t.itemId === where.itemId : true) && (where?.txnNumber?.startsWith ? t.txnNumber.startsWith(where.txnNumber.startsWith) : true));
        const last = rows[rows.length - 1];
        return last ? { txnNumber: last.txnNumber, balanceQty: D(last.balanceQty) } : null;
      },
      create: async ({ data }: Row) => { await tick(); state.txns.push(data); return data; },
    },
  };
  return base;
}

const db: Row = {
  ...makeDb(),
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => {
    const released: (() => void)[] = [];
    const tx: Row = {
      ...db,
      $queryRaw: async (_strings: TemplateStringsArray, key: string) => { released.push(await acquire(key)); return [{ locked: 1 }]; },
    };
    try { return await cb(tx); } finally { released.forEach((r) => r()); }
  },
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./audit', () => ({ logAuditEvent: async () => undefined }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { commitIssue } = await import('./store');

// R3-STK B08: an issue is checked against the smaller of the two books, so opening stock sits in both.
const stock = (itemId: string, qty: number) => {
  state.ledger.push({ itemId, changeQty: qty, balanceQty: qty, source: 'OPENING', sourceId: null, createdAt: stamp() });
  state.txns.push({ itemId, txnNumber: 'STXN-20260101-0001', balanceQty: qty });
};
const allocate = (qty: number) => state.allocations.push({ orderId: 'o1', itemId: 'i1', allocatedQty: qty, createdAt: stamp() });
const balance = (itemId: string) => state.ledger.filter((l) => l.itemId === itemId).at(-1)?.balanceQty;

beforeEach(() => {
  vi.clearAllMocks();
  mutex.clear();
  Object.assign(state, {
    ledger: [], txns: [], allocations: [], stamp: 0,
    order: { orderNumber: 'ORD-202610-00001', status: 'IN_PRODUCTION' },
    items: [kraft, die],
  });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('STORE_GUY');
});

describe('E. concurrent issues are serialised per item', () => {
  it('two issues of 60 against a stock of 100 cannot both pass the balance check', async () => {
    stock('i1', 100);
    const results = await Promise.allSettled([
      commitIssue([{ itemId: 'i1', qty: 60 }], {}),
      commitIssue([{ itemId: 'i1', qty: 60 }], {}),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(lost.reason)).toMatch(/stock balance/);
    expect(balance('i1')).toBe(40);
    expect(state.ledger.filter((l) => l.source === 'STORE_ISSUE')).toHaveLength(1);
  });

  it('two issues against one order cannot both slip under its allocation', async () => {
    stock('i1', 1000);
    allocate(100);
    const results = await Promise.allSettled([
      commitIssue([{ itemId: 'i1', qty: 60 }], { orderId: 'o1' }),
      commitIssue([{ itemId: 'i1', qty: 60 }], { orderId: 'o1' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(OrderStockQuotaExceededError);
    expect(state.ledger.filter((l) => l.source === 'STORE_ISSUE')).toHaveLength(1);
  });

  it('issues of different items do not wait for each other', async () => {
    stock('i1', 100);
    stock('i2', 100);
    const results = await Promise.allSettled([
      commitIssue([{ itemId: 'i1', qty: 60 }], {}),
      commitIssue([{ itemId: 'i2', qty: 60 }], { departmentId: 'd1' }),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });
});

describe('J. the typed quota error', () => {
  it('carries the sentence the tester guide expects, and asResult still shows it', async () => {
    stock('i1', 1000);
    allocate(100);
    await commitIssue([{ itemId: 'i1', qty: 60 }], { orderId: 'o1' });
    await expect(commitIssue([{ itemId: 'i1', qty: 61 }], { orderId: 'o1' })).rejects.toBeInstanceOf(OrderStockQuotaExceededError);
    const result = await asResult(() => commitIssue([{ itemId: 'i1', qty: 41 }], { orderId: 'o1' }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.detail).toMatch(/only 40 of the 100 allocated/);
  });
});

describe('F. equipment and other items are department overhead', () => {
  it('cannot be booked to an order through the direct issue path', async () => {
    stock('i2', 10);
    await expect(commitIssue([{ itemId: 'i2', qty: 1 }], { orderId: 'o1' })).rejects.toThrow(/department overhead.*Die/);
    await expect(commitIssue([{ itemId: 'i2', qty: 1 }], { orderId: 'o1', departmentId: 'd1' })).rejects.toThrow(/department overhead/);
    expect(state.ledger).toHaveLength(1);
  });

  it('need a department when there is no order', async () => {
    stock('i2', 10);
    await expect(commitIssue([{ itemId: 'i2', qty: 1 }], {})).rejects.toThrow(/must be issued to a department.*Die/);
    expect(state.ledger).toHaveLength(1);
    await commitIssue([{ itemId: 'i2', qty: 1 }], { departmentId: 'd1' });
    expect(balance('i2')).toBe(9);
  });

  it('raw material still issues to an order or as a general issue', async () => {
    stock('i1', 10);
    await commitIssue([{ itemId: 'i1', qty: 1 }], { orderId: 'o1' });
    await commitIssue([{ itemId: 'i1', qty: 1 }], {});
    expect(balance('i1')).toBe(8);
  });
});

describe('I. a closed order takes no stock', () => {
  it.each(['CANCELLED', 'COMPLETED', 'DELIVERED'])('%s is refused, nothing written', async (status) => {
    stock('i1', 10);
    state.order = { orderNumber: 'ORD-202610-00001', status };
    await expect(commitIssue([{ itemId: 'i1', qty: 1 }], { orderId: 'o1' })).rejects.toThrow(/closed|cannot take stock|cancelled|completed|delivered/i);
    expect(state.ledger).toHaveLength(1);
  });

  it('an order that no longer exists is a message, not a dangling reference', async () => {
    stock('i1', 10);
    state.order = null;
    await expect(commitIssue([{ itemId: 'i1', qty: 1 }], { orderId: 'gone' })).rejects.toThrow(/no longer exists/);
    expect(state.ledger).toHaveLength(1);
  });
});

describe('H. quantities are rounded before they are validated', () => {
  it('0.004 is zero once stored, so it is refused', async () => {
    stock('i1', 10);
    await expect(commitIssue([{ itemId: 'i1', qty: 0.004 }], {})).rejects.toThrow(/greater than zero/);
    expect(state.ledger).toHaveLength(1);
  });

  it('the cap and the balance are checked on the stored (2 dp) figure', async () => {
    stock('i1', 1000);
    allocate(100);
    await commitIssue([{ itemId: 'i1', qty: 40.004 }], { orderId: 'o1' }); // stored as 40
    expect(state.ledger.at(-1)?.changeQty).toBe(-40);
    await expect(commitIssue([{ itemId: 'i1', qty: 60.006 }], { orderId: 'o1' })).rejects.toThrow(/only 60 of the 100 allocated/); // 60.01
    await commitIssue([{ itemId: 'i1', qty: 60.004 }], { orderId: 'o1' }); // 60.00 fits exactly
    expect(balance('i1')).toBe(900);
  });
});

describe('G. the issue can run the caller’s own writes inside its transaction', () => {
  it('calls inTransaction with the transaction client after the ledger rows, and propagates its failure', async () => {
    stock('i1', 10);
    const seen: Row[] = [];
    await commitIssue([{ itemId: 'i1', qty: 1 }], {
      inTransaction: async (tx) => { seen.push({ tx, ledgerRows: state.ledger.length }); },
    });
    expect(seen).toHaveLength(1);
    expect(typeof (seen[0].tx as Row).$queryRaw).toBe('function'); // the tx, not the bare db
    expect(seen[0].ledgerRows).toBe(2);
    await expect(commitIssue([{ itemId: 'i1', qty: 1 }], { inTransaction: async () => { throw new Error('line write failed'); } })).rejects.toThrow(/line write failed/);
  });
});
