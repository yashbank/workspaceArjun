/** R3-PRD B118 guard: signOffPhase never touches the global db or audit while its interactive tx is open. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

let txOpen = false;
const audit = vi.fn((entry: Record<string, unknown>) => {
  if (txOpen) throw new Error(`logAuditEvent (${String(entry.action)}) called while a transaction is open`);
});
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (e: Record<string, unknown>) => audit(e) }));

type Row = Record<string, unknown>;
const st = { bookingReleased: null as Date | null, workerReleased: null as Date | null };
const PHASE = {
  id: 'ph-1', orderId: 'o1', sequence: 1, status: 'IN_PROGRESS', bomStageId: null, inChargeEmployeeId: 'e1', notes: null,
  process: { id: 'p', name: 'Coating', nameHi: null, code: 'P1' },
  inCharge: { id: 'e1', name: 'Vali', employeeCode: 'E1', userProfileId: 'u1' },
  order: { id: 'o1', orderNumber: 'ORD-1' },
};
const read = {
  misJobPhase: { findFirst: async () => PHASE, findMany: async () => [], update: async ({ data }: { data: Row }) => ({ id: 'ph-1', orderId: 'o1', sequence: 1, ...data }) },
  misProductionLog: { findMany: async () => [{ id: 'l', qtyProduced: 5, qtyWaste: 0, wasteReason: null, loggedAt: new Date(), unit: 'KG' }] },
  misQcCheck: { findMany: async () => [] },
  notification: { create: async () => ({}) },
  misMachineAllocation: {
    findMany: async () => (st.bookingReleased ? [] : [{ id: 'a1', machineId: 'm1' }]),
    updateMany: async (a: { data: { releasedAt: Date } }) => { st.bookingReleased = a.data.releasedAt; return { count: 1 }; },
  },
  misWorkerAllocation: {
    findMany: async () => (st.workerReleased ? [] : [{ id: 'w1', employeeId: 'e2', machineAllocationId: 'a1' }]),
    updateMany: async (a: { data: { releasedAt: Date } }) => { st.workerReleased = a.data.releasedAt; return { count: 1 }; },
  },
};
// Every method on the GLOBAL client fails while the tx is open; the tx handle is the same shapes, unguarded.
const guarded = Object.fromEntries(
  Object.entries(read).map(([model, methods]) => [
    model,
    Object.fromEntries(
      Object.entries(methods).map(([m, f]) => [
        m,
        (...a: unknown[]) => {
          if (txOpen) throw new Error(`global db call (${model}.${m}) while a transaction is open`);
          return (f as (...x: unknown[]) => unknown)(...a);
        },
      ]),
    ),
  ]),
);
const dbMock = {
  ...guarded,
  $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
    txOpen = true;
    try {
      return await cb(read);
    } finally {
      txOpen = false;
    }
  },
};
vi.mock('@/server/db', () => ({ db: dbMock }));

const { signOffPhase } = await import('./job-phases');

beforeEach(() => {
  vi.clearAllMocks();
  txOpen = false;
  st.bookingReleased = null;
  st.workerReleased = null;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
});

describe('signOffPhase transaction hygiene (B118)', () => {
  it('frees booking and crew with no global db / audit call inside the tx, and audits after commit', async () => {
    await signOffPhase('ph-1');
    expect(st.bookingReleased).toBeInstanceOf(Date);
    expect(st.workerReleased?.getTime()).toBe(st.bookingReleased?.getTime());
    const actions = audit.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual(expect.arrayContaining(['RELEASE_MACHINE', 'RELEASE_WORKER', 'SIGN_OFF_PHASE']));
  });
});
