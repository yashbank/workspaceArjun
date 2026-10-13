/** R3-ORD: B104 close/cancel side effects, B106 closed-order edit, B111 factory-day maths. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
// Guard (like PR #83): a global-client call, including logAuditEvent, while the tx is open fails.
let txOpen = false;
const audit = vi.fn((entry: Record<string, unknown>) => {
  if (txOpen) throw new Error(`logAuditEvent (${String(entry.action)}) called while a transaction is open`);
});
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (e: Record<string, unknown>) => audit(e) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const s = {
  status: 'IN_PRODUCTION',
  bookings: [] as Row[],
  workers: [] as Row[],
  reservations: 1,
  bom: null as Row | null,
  requests: [] as Row[],
  failReservationDelete: false,
  orders: [] as Row[],
};
const snapshot = () => JSON.parse(JSON.stringify({ status: s.status, bookings: s.bookings, workers: s.workers, reservations: s.reservations, bom: s.bom, requests: s.requests }));

const tx: Row = {
  misOrder: {
    findUnique: async () => ({ id: 'o1', orderNumber: 'ORD-1', status: s.status }),
    updateMany: async ({ where, data }: Row) => { if (where.status !== s.status) return { count: 0 }; s.status = data.status; return { count: 1 }; },
    update: async () => ({ id: 'o1', orderNumber: 'ORD-1', status: s.status }),
    findMany: async () => s.orders,
  },
  misJobPhase: { findMany: async () => [] },
  misQcCheck: { findMany: async () => [] },
  misProductionLog: { count: async () => 1 },
  misMachineAllocation: {
    findMany: async () => s.bookings.filter((b) => !b.releasedAt).map((b) => ({ id: b.id })),
    updateMany: async ({ where }: Row) => { s.bookings.forEach((b) => { if (where.id.in.includes(b.id)) b.releasedAt = 'x'; }); return { count: 1 }; },
  },
  misWorkerAllocation: {
    findMany: async () => s.workers.filter((w) => !w.releasedAt),
    updateMany: async () => { s.workers.forEach((w) => { w.releasedAt = 'x'; }); return { count: s.workers.length }; },
  },
  misOrderStockAllocation: {
    count: async () => s.reservations,
    deleteMany: async () => { if (s.failReservationDelete) throw new Error('boom'); const count = s.reservations; s.reservations = 0; return { count }; },
  },
  misBom: {
    findUnique: async () => s.bom,
    updateMany: async ({ where, data }: Row) => {
      if (s.bom && s.bom.status === where.status) { Object.assign(s.bom, data); return { count: 1 }; }
      return { count: 0 };
    },
  },
  misMaterialRequest: {
    findMany: async () => s.requests,
    updateMany: async ({ data }: Row) => { s.requests.forEach((r) => { r.status = data.status; }); return { count: s.requests.length }; },
  },
  $transaction: async (fn: (t: unknown) => unknown) => {
    const before = snapshot();
    txOpen = true;
    try { return await fn(tx); } catch (e) { Object.assign(s, before); throw e; } finally { txOpen = false; }
  },
};
// The global client: every model call fails while a transaction is open.
const globalDb: Row = Object.fromEntries(Object.entries(tx).map(([k, v]) => [
  k,
  typeof v === 'function' ? v : Object.fromEntries(Object.entries(v as Row).map(([m, f]) => [m, (...a: unknown[]) => {
    if (txOpen) throw new Error(`global db call (${k}.${m}) while a transaction is open`);
    return (f as (...x: unknown[]) => unknown)(...a);
  }])),
]));
vi.mock('@/server/db', () => ({ get db() { return globalDb; } }));

const { updateOrderStatus, updateOrder, listOrdersNeedingAction } = await import('./orders');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
  Object.assign(s, {
    status: 'IN_PRODUCTION', reservations: 1, bom: null, requests: [], failReservationDelete: false, orders: [],
    bookings: [{ id: 'b1', releasedAt: null }],
    workers: [{ id: 'w1', employeeId: 'e1', machineAllocationId: 'b1', releasedAt: null }, { id: 'w2', employeeId: 'e2', machineAllocationId: 'b1', releasedAt: null }],
  });
});

describe('B104 — close/cancel side effects', () => {
  it('cancel frees the booking, both workers and the reservation together', async () => {
    await updateOrderStatus('o1', 'CANCELLED', { reason: 'customer withdrew' });
    expect(s.status).toBe('CANCELLED');
    expect(s.bookings[0].releasedAt).toBeTruthy();
    expect(s.workers.every((w) => w.releasedAt)).toBe(true);
    expect(s.reservations).toBe(0);
  });

  it('a throw while releasing reservations rolls the status back', async () => {
    s.failReservationDelete = true;
    await expect(updateOrderStatus('o1', 'CANCELLED', { reason: 'customer withdrew' })).rejects.toThrow('boom');
    expect(s.status).toBe('IN_PRODUCTION');
    expect(s.bookings[0].releasedAt).toBeNull();
  });

  it('a pending BOM blocks cancel without confirmation and lists it; with confirm the BOM goes back to DRAFT', async () => {
    s.bom = { id: 'bom1', status: 'PENDING_APPROVAL' };
    s.requests = [{ id: 'r1', requestNumber: 'MR-1', status: 'PENDING', lines: [] }];
    const err = await updateOrderStatus('o1', 'CANCELLED', { reason: 'customer withdrew' }).catch((e) => e);
    expect(err.reason).toBe('OPEN_ITEMS');
    expect(err.openItems).toEqual(['BOM waiting for approval', 'Material request MR-1']);
    expect(s.status).toBe('IN_PRODUCTION');
    await updateOrderStatus('o1', 'CANCELLED', { reason: 'customer withdrew', confirmOpenItems: true });
    expect(s.bom!.status).toBe('DRAFT');
    expect(s.requests[0].status).toBe('REJECTED');
    expect(s.status).toBe('CANCELLED');
  });

  it('completing releases the bookings but keeps the reservations (COMPLETED can be reopened)', async () => {
    await updateOrderStatus('o1', 'COMPLETED');
    expect(s.status).toBe('COMPLETED');
    expect(s.bookings[0].releasedAt).toBeTruthy();
    expect(s.reservations).toBe(1);
    expect(audit.mock.calls.find(([e]) => e.action === 'order.status_change')![0].after).toMatchObject({ releasedReservations: 1, releasedMachines: 1, releasedWorkers: 2 });
  });

  it('release audit rows are written after commit, never inside the transaction', async () => {
    await updateOrderStatus('o1', 'CANCELLED', { reason: 'customer withdrew' });
    const actions = audit.mock.calls.map(([e]) => e.action);
    expect(actions.filter((a) => a === 'RELEASE_MACHINE')).toHaveLength(1);
    expect(actions.filter((a) => a === 'RELEASE_WORKER')).toHaveLength(2);
  });

  it('a stale BOM (no longer pending) is not reset', async () => {
    s.bom = { id: 'bom1', status: 'APPROVED' };
    await updateOrderStatus('o1', 'CANCELLED', { reason: 'customer withdrew', confirmOpenItems: true });
    expect(s.bom.status).toBe('APPROVED');
  });

  it('a plain forward move touches no bookings', async () => {
    s.status = 'CONFIRMED';
    await updateOrderStatus('o1', 'IN_PRODUCTION');
    expect(s.bookings[0].releasedAt).toBeNull();
    expect(s.reservations).toBe(1);
  });
});

describe('B106 — closed orders are not edited', () => {
  it.each(['DELIVERED', 'CANCELLED', 'COMPLETED'])('a %s order refuses a customer edit', async (status) => {
    s.status = status;
    await expect(updateOrder('o1', { customerId: 'c1' })).rejects.toThrow(/ORD-1 is .*Reopen it first/);
  });
});

describe('B111 — days to delivery use the factory day', () => {
  it('01:30 IST on the 14th is day 0 for a delivery on the 14th', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T20:00:00Z'));
    s.orders = [{ id: 'o1', orderNumber: 'ORD-1', status: 'CONFIRMED', deliveryDate: new Date('2026-10-14T00:00:00Z'), customer: null, bom: null, _count: { productionLogs: 0 } }];
    const [row] = await listOrdersNeedingAction();
    vi.useRealTimers();
    expect(row.daysToDelivery).toBe(0);
  });
});
