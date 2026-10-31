/** R2-292: adjustInventory, createStoreIn and createStoreOut take an optional idempotency key; the same key twice writes once. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });
const state: { ledger: Row[]; txns: Row[]; keyed: Map<string, unknown>; audits: Row[] } = { ledger: [], txns: [], keyed: new Map(), audits: [] };
const item = { id: 'i1', name: 'Kraft', code: 'K1', sku: null, unit: 'KG', category: 'RAW_MATERIAL', isActive: true, deletedAt: null };

const db: Row = {
  misItem: { findFirst: async () => item },
  misInventoryLedger: {
    findFirst: async () => { const last = state.ledger.at(-1); return last ? { balanceQty: D(last.balanceQty) } : null; },
    create: async ({ data }: Row) => { const row = { id: `l${state.ledger.length + 1}`, ...data }; state.ledger.push(row); return row; },
  },
  misStoreTransaction: {
    findFirst: async ({ where }: Row = {}) => { if (where?.txnNumber) return null; const last = state.txns.at(-1); return last ? { balanceQty: D(last.balanceQty) } : null; },
    create: async ({ data }: Row) => { const row = { id: `t${state.txns.length + 1}`, createdAt: new Date(), ...data }; state.txns.push(row); return { ...row, quantity: D(row.quantity), balanceQty: D(row.balanceQty) }; },
  },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => cb(db),
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./idempotency', () => ({
  runIdempotent: async (envelope: { key: string }, apply: (tx: Row) => Promise<{ result: unknown }>) => {
    if (state.keyed.has(envelope.key)) return { outcome: 'DUPLICATE', result: JSON.parse(JSON.stringify(state.keyed.get(envelope.key))) };
    const out = await db.$transaction((tx: Row) => apply(tx));
    state.keyed.set(envelope.key, (out as { result: unknown }).result);
    return { outcome: 'APPLIED', result: (out as { result: unknown }).result };
  },
}));
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(e); } }));
vi.mock('./store-notices', () => ({ notifyGeneralUse: async () => undefined }));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('./business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata', getRuleValue: async () => null }));

const { adjustInventory } = await import('./inventory');
const { createStoreIn, createStoreOut } = await import('./store');
const KEY = '9b1d7c52-8f55-4f7e-9d57-1a2b3c4d5e6f';
const G = { reason: 'grease for plates', costCenter: 'Press' };

beforeEach(() => { state.ledger = []; state.txns = []; state.keyed = new Map(); state.audits = []; });

describe('R2-292 keyed single-row writes', () => {
  it('adjustInventory: the same key twice writes one ledger row and one audit, and returns the same balance', async () => {
    expect(await adjustInventory('i1', 50, 'found a pallet', KEY)).toBe(50);
    expect(await adjustInventory('i1', 50, 'found a pallet', KEY)).toBe(50);
    expect(state.ledger).toHaveLength(1);
    expect(state.audits.filter((a) => a.action === 'inventory.adjust')).toHaveLength(1);
    expect(await adjustInventory('i1', 50, 'found a pallet')).toBe(100); // no key: a second, real adjustment
  });
  it('createStoreIn: one booking per key; the replay returns the first row', async () => {
    const first = await createStoreIn({ itemId: 'i1', quantity: 20, notes: 'opening', idempotencyKey: KEY });
    const second = await createStoreIn({ itemId: 'i1', quantity: 20, notes: 'opening', idempotencyKey: KEY });
    expect(second.txnNumber).toBe(first.txnNumber);
    expect(second.createdAt).toBeInstanceOf(Date);
    expect(state.ledger).toHaveLength(1);
    expect(state.audits.filter((a) => a.action === 'store.in')).toHaveLength(1);
  });
  it('createStoreOut: one booking per key', async () => {
    await createStoreIn({ itemId: 'i1', quantity: 20 });
    const first = await createStoreOut({ itemId: 'i1', quantity: 5, departmentId: undefined, general: G, idempotencyKey: KEY });
    const second = await createStoreOut({ itemId: 'i1', quantity: 5, general: G, idempotencyKey: KEY });
    expect(second.txnNumber).toBe(first.txnNumber);
    expect(state.ledger.filter((l) => l.source === 'STORE_ISSUE')).toHaveLength(1);
    expect(state.ledger.at(-1)!.balanceQty).toBe(15);
  });
});
