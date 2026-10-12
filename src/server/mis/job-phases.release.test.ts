import { beforeEach, describe, expect, it, vi } from 'vitest';

// C5 #42/#44 — signing a phase off frees the machine allocation(s) that phase held,
// and the machine board then shows the machine FREE.

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

type Alloc = { id: string; machineId: string; orderId: string; jobPhaseId: string | null; startsAt: Date; endsAt: Date; releasedAt: Date | null };
const state: { allocs: Alloc[] } = { allocs: [] };

const phaseFindFirst = vi.fn();
const phaseUpdate = vi.fn();

function matches(a: Alloc, where: Record<string, unknown>): boolean {
  if ('jobPhaseId' in where && a.jobPhaseId !== where.jobPhaseId) return false;
  if ('orderId' in where && a.orderId !== where.orderId) return false;
  if ('releasedAt' in where && where.releasedAt === null && a.releasedAt !== null) return false;
  const id = where.id as { in?: string[] } | undefined;
  if (id?.in && !id.in.includes(a.id)) return false;
  const s = where.startsAt as { lte?: Date } | undefined;
  const e = where.endsAt as { gte?: Date } | undefined;
  if (s?.lte && !(a.startsAt <= s.lte)) return false;
  if (e?.gte && !(a.endsAt >= e.gte)) return false;
  return true;
}

const dbMock = {
  misJobPhase: {
    findFirst: (...a: unknown[]) => phaseFindFirst(...a),
    findMany: async () => [],
    update: (...a: unknown[]) => phaseUpdate(...a),
  },
  misProductionLog: {
    findMany: async () => [{ id: 'log-1', qtyProduced: 100, qtyWaste: 0, wasteReason: null, loggedAt: new Date(), unit: 'KG' }],
    count: async () => 1,
  },
  misQcCheck: { findMany: async () => [] },
  misEmployee: { findUnique: async () => ({ id: 'emp-1', name: 'Vali Sah' }), findFirst: async () => null },
  notification: { create: async () => ({}) },
  misMachine: {
    findMany: async () => [
      { id: 'm1', name: 'Coater 1', isActive: true, department: { name: 'Coating' } },
      { id: 'm2', name: 'Coater 2', isActive: true, department: { name: 'Coating' } },
    ],
  },
  misMachineAllocation: {
    findMany: async ({ where }: { where: Record<string, unknown> }) => state.allocs.filter((a) => matches(a, where)).map((a) => ({
      ...a,
      machine: { id: a.machineId, name: a.machineId === 'm1' ? 'Coater 1' : 'Coater 2' },
      order: { orderNumber: 'ORD-1' },
      jobPhase: { id: a.jobPhaseId, process: { name: 'Coating' } },
    })),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { releasedAt: Date } }) => {
      const hit = state.allocs.filter((a) => matches(a, where));
      hit.forEach((a) => { a.releasedAt = data.releasedAt; });
      return { count: hit.length };
    },
  },
  $transaction: (fn: (tx: unknown) => unknown) => fn(dbMock),
};
vi.mock('@/server/db', () => ({ db: dbMock }));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const { signOffPhase } = await import('./job-phases');
const { getMachineBoard, machineForOrder } = await import('./machines-board');

const PHASE = {
  id: 'ph-1', orderId: 'ord-1', sequence: 1, status: 'IN_PROGRESS', bomStageId: null,
  inChargeEmployeeId: 'emp-1', notes: null, signedOffAt: null,
  process: { id: 'p1', name: 'Coating', nameHi: null, code: 'PROC-1' },
  inCharge: { id: 'emp-1', name: 'Vali Sah', employeeCode: 'E-1', userProfileId: 'user-1' },
  order: { id: 'ord-1', orderNumber: 'ORD-1' },
};
const hour = 3600_000;

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'user-1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
  phaseFindFirst.mockImplementation(async () => PHASE);
  phaseUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'ph-1', orderId: 'ord-1', sequence: 1, ...data }));
  const now = Date.now();
  state.allocs = [
    { id: 'a1', machineId: 'm1', orderId: 'ord-1', jobPhaseId: 'ph-1', startsAt: new Date(now - hour), endsAt: new Date(now + hour), releasedAt: null },
    { id: 'a2', machineId: 'm2', orderId: 'ord-1', jobPhaseId: 'ph-OTHER', startsAt: new Date(now - hour), endsAt: new Date(now + hour), releasedAt: null },
  ];
});

describe('signOffPhase releases the phase machine (#42/#44)', () => {
  it('shows BUSY before and FREE after sign-off, and leaves other phases alone', async () => {
    const before = await getMachineBoard();
    expect(before.find((m) => m.id === 'm1')?.status).toBe('BUSY');

    await signOffPhase('ph-1');

    const after = await getMachineBoard();
    expect(after.find((m) => m.id === 'm1')?.status).toBe('FREE');
    expect(after.find((m) => m.id === 'm2')?.status).toBe('BUSY');
    expect(state.allocs[0].releasedAt).toBeInstanceOf(Date);
    expect(state.allocs[1].releasedAt).toBeNull();
  });

  it('audit-logs the release', async () => {
    await signOffPhase('ph-1');
    const release = mockAudit.mock.calls.map((c) => c[0]).find((e) => e.action === 'RELEASE_MACHINE');
    expect(release).toMatchObject({ entity: 'MisMachineAllocation', entityId: 'a1', actorId: 'user-1' });
  });

  it('does not touch allocations already released', async () => {
    const earlier = new Date(Date.now() - 5 * hour);
    state.allocs[0].releasedAt = earlier;
    await signOffPhase('ph-1');
    expect(state.allocs[0].releasedAt).toBe(earlier);
    expect(mockAudit.mock.calls.some((c) => c[0].action === 'RELEASE_MACHINE')).toBe(false);
  });

  it('a refused sign-off releases nothing', async () => {
    getCurrentUser.mockResolvedValue({ id: 'someone-else' });
    await expect(signOffPhase('ph-1')).rejects.toMatchObject({ reason: 'NOT_THE_IN_CHARGE' });
    expect(state.allocs[0].releasedAt).toBeNull();
  });
});

describe('machineForOrder (#39/#43)', () => {
  it('returns the one allocated machine', async () => {
    state.allocs = [state.allocs[0]];
    expect(await machineForOrder('ord-1')).toEqual({ id: 'm1', name: 'Coater 1' });
  });
  it('returns null when several machines are allocated (no guessing)', async () => {
    expect(await machineForOrder('ord-1')).toBeNull();
  });
  it('returns null once released', async () => {
    state.allocs = [state.allocs[0]];
    await signOffPhase('ph-1');
    expect(await machineForOrder('ord-1')).toBeNull();
  });
  it('is gated on production.read', async () => {
    getMisRole.mockResolvedValue('ATTENDANCE_OPERATOR');
    await expect(machineForOrder('ord-1')).rejects.toThrow(/Not permitted: production\.read/);
  });
});
