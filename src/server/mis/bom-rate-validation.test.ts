/**
 * BOM Material Rate Validation:
 * In BOM editing, material ratePerUnit (amount/rate) must be strictly greater than 0 (> 0)
 * when specified. A rate of 0 or a negative rate must be rejected with a clear error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const state: { boms: Row[]; stages: Row[]; materials: Row[]; audits: Row[] } = {
  boms: [],
  stages: [],
  materials: [],
  audits: [],
};
let seq = 0;
const nextId = () => `id-${++seq}`;

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/mis/audit', () => ({
  logAuditEvent: async (e: Row) => {
    state.audits.push(e);
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const db = {
  misBom: {
    findUnique: async ({ where }: Row) =>
      state.boms.find((b) => b.id === where.id || b.orderId === where.orderId) ?? null,
    create: async ({ data }: Row) => {
      const row = { id: nextId(), status: 'DRAFT', ...data };
      state.boms.push(row);
      return row;
    },
    update: async ({ where, data }: Row) => {
      const row = state.boms.find((b) => b.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
  },
  misBomStage: {
    findUnique: async ({ where }: Row) => {
      const stage = state.stages.find((s) => s.id === where.id);
      return stage ? { ...stage, bom: state.boms.find((b) => b.id === stage.bomId) ?? null } : null;
    },
    create: async ({ data }: Row) => {
      const row = { id: nextId(), ...data };
      state.stages.push(row);
      return row;
    },
  },
  misBomMaterial: {
    findUnique: async ({ where }: Row) => {
      const mat = state.materials.find((m) => m.id === where.id);
      const stage = mat && state.stages.find((s) => s.id === mat.stageId);
      return mat ? { ...mat, stage: stage ? { bom: state.boms.find((b) => b.id === stage.bomId) ?? null } : null } : null;
    },
    create: async ({ data }: Row) => {
      const row = { id: nextId(), ...data };
      state.materials.push(row);
      return row;
    },
    update: async ({ where, data }: Row) => {
      const row = state.materials.find((m) => m.id === where.id);
      if (!row) throw new Error('Material not found');
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }: Row) => {
      const idx = state.materials.findIndex((m) => m.id === where.id);
      if (idx >= 0) return state.materials.splice(idx, 1)[0];
      return null;
    },
  },
  misOrder: {
    findUnique: async () => ({ orderNumber: 'ORD-1', status: 'CONFIRMED' }),
  },
  misItem: {
    findUnique: async ({ where }: Row) => ({ id: where.id, isActive: true }),
  },
};

vi.mock('@/server/db', () => ({
  get db() {
    return db;
  },
}));

const { createBom, addBomStage, addBomMaterial, updateBomMaterial } = await import('./bom');
const { addMaterialAction, updateMaterialAction } = await import('@/app/(mis)/mis/bom/actions');

const as = (role: string) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

beforeEach(async () => {
  seq = 0;
  state.boms = [];
  state.stages = [];
  state.materials = [];
  state.audits = [];
  vi.clearAllMocks();
  as('OWNER');
});

describe('BOM material ratePerUnit validation (> 0)', () => {
  async function seedDraftStage() {
    const bom = await createBom('order-1');
    const stage = await addBomStage(bom.id, { stageName: 'Printing', seq: 0 });
    return { bom, stage };
  }

  it('rejects adding a material with ratePerUnit equal to 0', async () => {
    const { stage } = await seedDraftStage();
    await expect(
      addBomMaterial(stage.id, {
        description: 'Ink Black',
        quantity: 10,
        unit: 'KG',
        ratePerUnit: 0,
        seq: 0,
      }),
    ).rejects.toThrow(/rate.*must be greater than zero|rate.*positive|greater than 0/i);
    expect(state.materials).toHaveLength(0);
  });

  it('rejects adding a material with negative ratePerUnit', async () => {
    const { stage } = await seedDraftStage();
    await expect(
      addBomMaterial(stage.id, {
        description: 'Ink Cyan',
        quantity: 5,
        unit: 'KG',
        ratePerUnit: -15.5,
        seq: 0,
      }),
    ).rejects.toThrow(/rate.*must be greater than zero|rate.*positive|greater than 0/i);
    expect(state.materials).toHaveLength(0);
  });

  it('accepts adding a material with valid positive ratePerUnit', async () => {
    const { stage } = await seedDraftStage();
    const created = await addBomMaterial(stage.id, {
      description: 'Ink Magenta',
      quantity: 5,
      unit: 'KG',
      ratePerUnit: 450.0,
      seq: 0,
    });
    expect(created.ratePerUnit).toBe(450.0);
    expect(state.materials).toHaveLength(1);
  });

  it('rejects updating an existing material ratePerUnit to 0', async () => {
    const { stage } = await seedDraftStage();
    const created = await addBomMaterial(stage.id, {
      description: 'Paper 300 GSM',
      quantity: 100,
      unit: 'SHEET',
      ratePerUnit: 12.5,
      seq: 0,
    });

    await expect(
      updateBomMaterial(created.id, {
        ratePerUnit: 0,
      }),
    ).rejects.toThrow(/rate.*must be greater than zero|rate.*positive|greater than 0/i);
    expect(state.materials[0].ratePerUnit).toBe(12.5);
  });

  it('rejects updating an existing material ratePerUnit to negative number', async () => {
    const { stage } = await seedDraftStage();
    const created = await addBomMaterial(stage.id, {
      description: 'Paper 300 GSM',
      quantity: 100,
      unit: 'SHEET',
      ratePerUnit: 12.5,
      seq: 0,
    });

    await expect(
      updateBomMaterial(created.id, {
        ratePerUnit: -25.0,
      }),
    ).rejects.toThrow(/rate.*must be greater than zero|rate.*positive|greater than 0/i);
    expect(state.materials[0].ratePerUnit).toBe(12.5);
  });

  it('accepts updating an existing material ratePerUnit to a positive value', async () => {
    const { stage } = await seedDraftStage();
    const created = await addBomMaterial(stage.id, {
      description: 'Paper 300 GSM',
      quantity: 100,
      unit: 'SHEET',
      ratePerUnit: 12.5,
      seq: 0,
    });

    const updated = await updateBomMaterial(created.id, {
      ratePerUnit: 15.0,
    });
    expect(updated.ratePerUnit).toBe(15.0);
  });

  it('addMaterialAction returns ok: false when Owner specifies ratePerUnit <= 0', async () => {
    const { stage } = await seedDraftStage();
    const res = await addMaterialAction(stage.id, {
      description: 'Glue',
      quantity: 2,
      unit: 'KG',
      ratePerUnit: 0,
      seq: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.detail).toMatch(/rate.*must be greater than zero|rate.*positive|greater than 0/i);
    }
  });

  it('updateMaterialAction returns ok: false when Owner updates ratePerUnit <= 0', async () => {
    const { stage } = await seedDraftStage();
    const mat = await addBomMaterial(stage.id, {
      description: 'Glue',
      quantity: 2,
      unit: 'KG',
      ratePerUnit: 100,
      seq: 0,
    });

    const res = await updateMaterialAction(mat.id, {
      ratePerUnit: -50,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.detail).toMatch(/rate.*must be greater than zero|rate.*positive|greater than 0/i);
    }
  });
});
