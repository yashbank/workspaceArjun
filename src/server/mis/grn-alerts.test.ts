/**
 * V2 Epic 4 — on confirm, every OWNER and ADMIN login gets a GRN alert; only the Owner's copy
 * carries rupees; opening the GRN clears the caller's own alert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n });
const state: { notifications: Row[]; updates: Row[]; grn: Row | null } = { notifications: [], updates: [], grn: null };
const RATE = 731.19;

vi.mock('@/server/db', () => ({
  db: {
    misGrn: { findUnique: async () => state.grn },
    userProfile: {
      findMany: async () => [
        { id: 'owner-1', misEmployee: { role: 'OWNER' } },
        { id: 'admin-1', misEmployee: { role: 'ADMIN' } },
      ],
    },
    notification: {
      createMany: async ({ data }: Row) => { state.notifications.push(...data); return { count: data.length }; },
      findMany: async ({ where }: Row) => state.notifications.filter((n) => n.userId === where.userId && n.type === where.type).map((n, i) => ({ id: `n${i}`, createdAt: new Date(), ...n })),
      updateMany: async (args: Row) => { state.updates.push(args); return { count: 1 }; },
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { clearGrnAlertsFor, listGrnAlerts, notifyGrnConfirmed } = await import('./grn-alerts');

beforeEach(() => {
  vi.clearAllMocks();
  state.notifications = []; state.updates = [];
  state.grn = {
    id: 'g1', grnNumber: 'GRN-1', receivedAt: new Date('2026-10-09T10:00:00Z'), supplierInvoiceAmount: D(1000),
    po: { poNumber: 'PO-1', supplier: { name: 'Acme' } },
    items: [{ receivedQty: D(1), damageQuantity: D(0), shortQuantity: null, poItem: { description: 'Kraft', quantity: D(2), ratePerUnit: D(RATE) } }],
  };
  getCurrentUser.mockResolvedValue({ id: 'owner-1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('notifyGrnConfirmed', () => {
  it('writes one row per OWNER/ADMIN login; the Owner copy has the money, the Admin copy has none', async () => {
    await notifyGrnConfirmed('g1');
    expect(state.notifications.map((n) => n.userId)).toEqual(['owner-1', 'admin-1']);
    const owner = state.notifications[0].payload, admin = state.notifications[1].payload;
    expect(owner.money).toEqual({ receivedValue: '₹731.19', invoiced: '₹1,000.00', variance: '₹268.81' });
    expect(JSON.stringify(admin)).not.toMatch(/731|money|variance/);
    expect(admin).toMatchObject({ grnNumber: 'GRN-1', poNumber: 'PO-1', attention: true, lines: [{ ordered: 2, received: 1, underReceived: 1 }] });
  });

  it('a delivery exactly as ordered with no invoice variance is not flagged for attention', async () => {
    state.grn!.items[0].receivedQty = D(2);
    state.grn!.supplierInvoiceAmount = D(2 * RATE);
    await notifyGrnConfirmed('g1');
    expect(state.notifications[0].payload.attention).toBe(false);
  });

  it('never throws — a failed alert must not undo a confirmed receipt', async () => {
    state.grn = null;
    await expect(notifyGrnConfirmed('nope')).resolves.toBeUndefined();
  });
});

describe('reading and clearing', () => {
  it('lists only the caller\'s own unread GRN alerts, and a STORE_GUY is refused', async () => {
    await notifyGrnConfirmed('g1');
    expect((await listGrnAlerts()).map((a) => a.grnNumber)).toEqual(['GRN-1']);
    getCurrentUser.mockResolvedValue({ id: 'store-1' });
    getMisRole.mockResolvedValue('STORE_GUY');
    await expect(listGrnAlerts()).rejects.toThrow(/Not permitted/);
  });

  it('clearing is scoped to the caller and the one GRN', async () => {
    await clearGrnAlertsFor('g1');
    expect(state.updates[0].where).toMatchObject({ userId: 'owner-1', readAt: null, payload: { path: ['grnId'], equals: 'g1' } });
  });
});
