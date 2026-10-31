/** R3-ORD: B106 BOM on closed orders, B107 named-field writes, B108 completeness, B109 stage in use. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const s = {
  orderStatus: 'CONFIRMED',
  boms: [] as Row[],
  stageCount: 1,
  materialCount: 1,
  usage: { logs: 0, checks: 0, phases: 0 },
  created: [] as Row[],
  item: { id: 'i1', isActive: true } as Row | null,
  /** R2-269/270: what assertBomComplete now reads — stages with their materials; null itemId = uncatalogued. */
  stages: null as Row[] | null,
};
const stagesFromCounts = (): Row[] =>
  Array.from({ length: s.stageCount }, (_, i) => ({ stageName: `Stage ${i + 1}`, materials: i === 0 ? Array.from({ length: s.materialCount }, (_, j) => ({ description: `Mat ${j + 1}`, itemId: 'i1' })) : [{ description: 'Filler', itemId: 'i1' }] }));
const draft = { id: 'bom-draft', orderId: 'o1', status: 'DRAFT' };
const approved = { id: 'bom-approved', orderId: 'o1', status: 'APPROVED' };
const db: Row = {
  misOrder: { findUnique: async () => ({ orderNumber: 'ORD-1', status: s.orderStatus }) },
  misBom: {
    findUnique: async ({ where }: Row) => {
      const b = s.boms.find((x) => (where.id ? x.id === where.id : x.orderId === where.orderId));
      return b ? { ...b, order: { orderNumber: 'ORD-1', status: s.orderStatus } } : null;
    },
    create: async ({ data }: Row) => ({ id: 'new', ...data }),
    update: async ({ data }: Row) => ({ id: 'x', ...data }),
  },
  misBomStage: {
    findUnique: async () => ({ id: 'st1', bomId: 'bom-draft', bom: { status: 'DRAFT', order: { orderNumber: 'ORD-1', status: s.orderStatus } } }),
    create: async ({ data }: Row) => { s.created.push(data); return { id: 'st-new', ...data }; },
    count: async () => s.stageCount,
    findMany: async () => s.stages ?? stagesFromCounts(), // R2-269/270
    delete: async () => ({}),
  },
  misBomMaterial: {
    create: async ({ data }: Row) => { s.created.push(data); return { id: 'm-new', ...data }; },
    count: async () => s.materialCount,
  },
  misItem: { findUnique: async () => s.item },
  misProductionLog: { count: async () => s.usage.logs },
  misQcCheck: { count: async () => s.usage.checks },
  misJobPhase: { count: async () => s.usage.phases },
};
vi.mock('@/server/db', () => ({ get db() { return db; } }));

const { createBom, addBomStage, addBomMaterial, submitBomForApproval, approveBom, deleteBomStage } = await import('./bom');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  Object.assign(s, { orderStatus: 'CONFIRMED', boms: [draft, approved], stageCount: 1, materialCount: 1, usage: { logs: 0, checks: 0, phases: 0 }, created: [], item: { id: 'i1', isActive: true }, stages: null });
});

describe('B106', () => {
  it('createBom on a CANCELLED order is refused', async () => {
    s.orderStatus = 'CANCELLED';
    s.boms = [];
    await expect(createBom('o1')).rejects.toThrow(/ORD-1 is cancelled\. Reopen it first/);
  });
  it('addBomStage on a DELIVERED order is refused', async () => {
    s.orderStatus = 'DELIVERED';
    await expect(addBomStage('bom-draft', { stageName: 'Print', seq: 0 })).rejects.toThrow(/Reopen it first/);
  });
});

describe('B107', () => {
  it('a payload carrying the id of an APPROVED BOM still writes to the validated draft', async () => {
    await addBomStage('bom-draft', { stageName: 'Print', seq: 0, ...({ bomId: 'bom-approved' } as object) } as never);
    expect(s.created[0].bomId).toBe('bom-draft');
    await addBomMaterial('st1', { description: 'Ink', quantity: 2, unit: 'kg', seq: 0, ...({ stageId: 'other' } as object) } as never);
    expect(s.created[1].stageId).toBe('st1');
  });
  it('quantity 0, blank unit or an inactive item is refused', async () => {
    await expect(addBomMaterial('st1', { description: 'Ink', quantity: 0, unit: 'kg', seq: 0 })).rejects.toThrow(/more than zero/);
    await expect(addBomMaterial('st1', { description: 'Ink', quantity: 1, unit: ' ', seq: 0 })).rejects.toThrow(/needs a unit/);
    s.item = { id: 'i1', isActive: false };
    await expect(addBomMaterial('st1', { description: 'Ink', itemId: 'i1', quantity: 1, unit: 'kg', seq: 0 })).rejects.toThrow(/inactive/);
  });
});

describe('B108', () => {
  it('submit and approve need a stage and a material', async () => {
    s.stageCount = 0;
    await expect(submitBomForApproval('bom-draft')).rejects.toThrow(/at least one stage/);
    s.stageCount = 1; s.materialCount = 0;
    await expect(submitBomForApproval('bom-draft')).rejects.toThrow(/at least one material/);
    s.boms = [{ id: 'bp', orderId: 'o1', status: 'PENDING_APPROVAL' }];
    await expect(approveBom('bp')).rejects.toThrow(/at least one material/);
  });
  it('R2-270: every stage needs a material — a second, empty stage is named and refused', async () => {
    s.stages = [
      { stageName: 'Printing', materials: [{ description: 'Ink', itemId: 'i1' }] },
      { stageName: 'Lamination', materials: [] },
    ];
    await expect(submitBomForApproval('bom-draft')).rejects.toThrow(/Stage "Lamination" has no material/);
    s.boms = [{ id: 'bp', orderId: 'o1', status: 'PENDING_APPROVAL' }];
    await expect(approveBom('bp')).rejects.toThrow(/Stage "Lamination" has no material/);
  });

  it('R2-269: a material with no catalogue item blocks submit, naming the line; linked lines pass', async () => {
    s.stages = [{ stageName: 'Printing', materials: [{ description: 'Ink', itemId: 'i1' }, { description: 'Special Ink', itemId: null }] }];
    await expect(submitBomForApproval('bom-draft')).rejects.toThrow(/"Special Ink" is not linked to a catalogue item/);
    s.stages = [{ stageName: 'Printing', materials: [{ description: 'Ink', itemId: 'i1' }, { description: 'Special Ink', itemId: 'i2' }] }];
    await expect(submitBomForApproval('bom-draft')).resolves.toBeDefined();
  });

  it('submit on a closed order is refused; a complete BOM on an open order passes', async () => {
    s.orderStatus = 'CANCELLED';
    await expect(submitBomForApproval('bom-draft')).rejects.toThrow(/Reopen it first/);
    s.orderStatus = 'CONFIRMED';
    await expect(submitBomForApproval('bom-draft')).resolves.toBeDefined();
  });
});

describe('B109', () => {
  it.each([
    [{ logs: 2, checks: 0, phases: 0 }],
    [{ logs: 0, checks: 3, phases: 0 }],
    [{ logs: 0, checks: 0, phases: 1 }],
  ])('a stage referenced by %j cannot be deleted', async (usage) => {
    s.usage = usage;
    await expect(deleteBomStage('st1')).rejects.toThrow(`Stage is used by ${usage.logs} production entries / ${usage.checks} QC checks / ${usage.phases} phases`);
  });
  it('an unused stage is deleted', async () => {
    await expect(deleteBomStage('st1')).resolves.toBeUndefined();
  });
});
