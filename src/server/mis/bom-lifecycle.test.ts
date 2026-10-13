/**
 * Tester round 2, cluster C2 — BOM draft lifecycle: #1 reject, #3 delete, #10 edit stage/material,
 * and the DRAFT-only guards on add / delete / reorder. Rates stay Owner-only throughout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const state: { boms: Row[]; stages: Row[]; materials: Row[]; pos: Row[]; requests: Row[] } = { boms: [], stages: [], materials: [], pos: [], requests: [] };
let seq = 0;
const nextId = () => `id-${++seq}`;

const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
const notifyRoles = vi.fn();
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: (...a: unknown[]) => notifyRoles(...a) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const db: Row = {
  misBom: {
    findUnique: async ({ where }: Row) => {
      const bom = state.boms.find((b) => (where.id ? b.id === where.id : b.orderId === where.orderId));
      return bom ? { ...bom, order: { orderNumber: `ORD-${bom.orderId}` } } : null;
    },
    create: async ({ data }: Row) => { const row = { id: nextId(), status: 'DRAFT', ...data }; state.boms.push(row); return row; },
    update: async ({ where, data }: Row) => { const row = state.boms.find((b) => b.id === where.id)!; Object.assign(row, data); return row; },
    delete: async ({ where }: Row) => { state.boms = state.boms.filter((b) => b.id !== where.id); },
  },
  misBomStage: {
    findUnique: async ({ where }: Row) => {
      const stage = state.stages.find((s) => s.id === where.id);
      return stage ? { ...stage, bom: state.boms.find((b) => b.id === stage.bomId) ?? null } : null;
    },
    create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.stages.push(row); return row; },
    update: async ({ where, data }: Row) => { const row = state.stages.find((s) => s.id === where.id)!; Object.assign(row, data); return row; },
    delete: async ({ where }: Row) => { state.stages = state.stages.filter((s) => s.id !== where.id); },
    deleteMany: async ({ where }: Row) => { state.stages = state.stages.filter((s) => s.bomId !== where.bomId); },
  },
  misBomMaterial: {
    findUnique: async ({ where }: Row) => {
      const mat = state.materials.find((m) => m.id === where.id);
      const stage = mat && state.stages.find((s) => s.id === mat.stageId);
      return mat ? { ...mat, stage: stage ? { bom: state.boms.find((b) => b.id === stage.bomId) ?? null } : null } : null;
    },
    create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.materials.push(row); return row; },
    update: async ({ where, data }: Row) => { const row = state.materials.find((m) => m.id === where.id)!; Object.assign(row, data); return row; },
    delete: async ({ where }: Row) => { state.materials = state.materials.filter((m) => m.id !== where.id); },
    deleteMany: async ({ where }: Row) => {
      const stageIds = state.stages.filter((s) => s.bomId === where.stage.bomId).map((s) => s.id);
      state.materials = state.materials.filter((m) => !stageIds.includes(m.stageId));
    },
  },
  misPurchaseOrder: { count: async ({ where }: Row) => state.pos.filter((p) => p.bomRef === where.bomRef).length },
  misMaterialRequest: { count: async ({ where }: Row) => state.requests.filter((r) => r.orderId === where.orderId).length },
  $transaction: async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
};
// R3-ORD fixtures: the new guards read the order's status and count stage/material/usage rows.
Object.assign(db, {
  misOrder: { findUnique: async () => ({ orderNumber: 'ORD-1', status: 'CONFIRMED' }) },
  misProductionLog: { count: async () => 0 },
  misQcCheck: { count: async () => 0 },
  misJobPhase: { count: async () => 0 },
});
Object.assign(db.misBomStage, { count: async () => 1 });
Object.assign(db.misBomMaterial, { count: async () => 1 });
vi.mock('@/server/db', () => ({ get db() { return db; } }));

const bomApi = await import('./bom');

/** A BOM with one stage and one material; `status` set directly so each test starts where it needs. */
async function seedBom(status = 'DRAFT') {
  getMisRole.mockResolvedValue('OWNER');
  const bom = await bomApi.createBom('order-1');
  const stage = await bomApi.addBomStage(bom.id, { stageName: 'Print', seq: 0 });
  const material = await bomApi.addBomMaterial(stage.id, { description: 'Ink', quantity: 2, unit: 'KG', ratePerUnit: 500, seq: 0 });
  state.boms[0].status = status;
  return { bom, stage, material: material as Row };
}

beforeEach(() => {
  seq = 0;
  state.boms = []; state.stages = []; state.materials = []; state.pos = []; state.requests = [];
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('DRAFT-only structure edits', () => {
  it.each(['PENDING_APPROVAL', 'APPROVED'])('add / delete / reorder stage and add / delete material are refused on a %s BOM', async (status) => {
    const { bom, stage, material } = await seedBom(status);
    await expect(bomApi.addBomStage(bom.id, { stageName: 'X', seq: 1 })).rejects.toThrow(/not a draft/i);
    await expect(bomApi.reorderBomStages(bom.id, [stage.id])).rejects.toThrow(/not a draft/i);
    await expect(bomApi.addBomMaterial(stage.id, { description: 'M', quantity: 1, unit: 'KG', seq: 1 })).rejects.toThrow(/not a draft/i);
    await expect(bomApi.deleteBomMaterial(material.id)).rejects.toThrow(/not a draft/i);
    await expect(bomApi.deleteBomStage(stage.id)).rejects.toThrow(/not a draft/i);
    expect(state.stages).toHaveLength(1);
    expect(state.materials).toHaveLength(1);
  });
});

describe('#1 rejectBom', () => {
  it('PENDING_APPROVAL goes back to DRAFT, audited with the reason, and Admin is notified', async () => {
    const { bom } = await seedBom('PENDING_APPROVAL');
    const rec = await bomApi.rejectBom('order-1', '  Missing the lamination stage ');
    expect(rec.status).toBe('DRAFT');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT_BOM', entityId: bom.id, after: expect.objectContaining({ reason: 'Missing the lamination stage' }) }));
    expect(notifyRoles).toHaveBeenCalledWith(['ADMIN'], 'mis.bom_rejected', expect.objectContaining({ orderId: 'order-1', reason: 'Missing the lamination stage' }), 'u1');
  });

  it('needs a reason of at least 3 characters', async () => {
    await seedBom('PENDING_APPROVAL');
    await expect(bomApi.rejectBom('order-1', ' a ')).rejects.toThrow(/at least 3/i);
    expect(state.boms[0].status).toBe('PENDING_APPROVAL');
  });

  it.each(['DRAFT', 'APPROVED'])('refuses a %s BOM', async (status) => {
    await seedBom(status);
    await expect(bomApi.rejectBom('order-1', 'no good')).rejects.toThrow(/not pending approval/i);
    expect(state.boms[0].status).toBe(status);
  });

  it('uses the approve permission: an Admin (no wages.read) is refused', async () => {
    await seedBom('PENDING_APPROVAL');
    getMisRole.mockResolvedValue('ADMIN');
    await expect(bomApi.rejectBom('order-1', 'no good')).rejects.toThrow();
    expect(state.boms[0].status).toBe('PENDING_APPROVAL');
  });
});

describe('#3 deleteBom', () => {
  it('removes a DRAFT BOM with its stages and materials, and audits it', async () => {
    await seedBom('DRAFT');
    await bomApi.deleteBom('order-1');
    expect(state.boms).toHaveLength(0);
    expect(state.stages).toHaveLength(0);
    expect(state.materials).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_BOM' }));
  });

  it.each(['PENDING_APPROVAL', 'APPROVED'])('refuses a %s BOM', async (status) => {
    await seedBom(status);
    await expect(bomApi.deleteBom('order-1')).rejects.toThrow(/not a draft/i);
    expect(state.boms).toHaveLength(1);
  });

  it('refuses while a PO refers to the order number', async () => {
    await seedBom('DRAFT');
    state.pos.push({ id: 'p1', bomRef: 'ORD-order-1' });
    await expect(bomApi.deleteBom('order-1')).rejects.toThrow(/purchase order/i);
    expect(state.boms).toHaveLength(1);
  });

  it('refuses while a material request refers to the order', async () => {
    await seedBom('DRAFT');
    state.requests.push({ id: 'r1', orderId: 'order-1' });
    await expect(bomApi.deleteBom('order-1')).rejects.toThrow(/material request/i);
    expect(state.boms).toHaveLength(1);
  });

  it('is behind orders.write', async () => {
    await seedBom('DRAFT');
    getMisRole.mockResolvedValue('QC');
    await expect(bomApi.deleteBom('order-1')).rejects.toThrow();
    expect(state.boms).toHaveLength(1);
  });
});

describe('#10 updateBomStage / updateBomMaterial', () => {
  it('edits a stage name, notes and sequence on a draft', async () => {
    const { stage } = await seedBom();
    const rec = await bomApi.updateBomStage(stage.id, { stageName: ' Varnish ', notes: 'two coats', seq: 3 });
    expect(rec).toMatchObject({ stageName: 'Varnish', notes: 'two coats', seq: 3 });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE_BOM_STAGE' }));
  });

  it('refuses a blank stage name', async () => {
    const { stage } = await seedBom();
    await expect(bomApi.updateBomStage(stage.id, { stageName: '  ' })).rejects.toThrow(/name/i);
  });

  it('edits description, quantity, unit and sequence of a material on a draft', async () => {
    const { material } = await seedBom();
    await bomApi.updateBomMaterial(material.id, { description: 'Red ink', quantity: 7, unit: 'LTR', seq: 2 });
    expect(state.materials[0]).toMatchObject({ description: 'Red ink', quantity: 7, unit: 'LTR', seq: 2 });
  });

  it.each(['PENDING_APPROVAL', 'APPROVED'])('both are refused on a %s BOM', async (status) => {
    const { stage, material } = await seedBom(status);
    await expect(bomApi.updateBomStage(stage.id, { stageName: 'Z' })).rejects.toThrow(/not a draft/i);
    await expect(bomApi.updateBomMaterial(material.id, { quantity: 9 })).rejects.toThrow(/not a draft/i);
    expect(state.materials[0].quantity).toBe(2);
  });

  it('the Owner can change the rate', async () => {
    const { material } = await seedBom();
    const rec = await bomApi.updateBomMaterial(material.id, { ratePerUnit: 650 });
    expect(state.materials[0].ratePerUnit).toBe(650);
    expect(rec).toHaveProperty('ratePerUnit', 650);
  });

  it('an Admin edit ignores the rate, keeps the stored one, and is handed no rate back', async () => {
    const { material } = await seedBom();
    getMisRole.mockResolvedValue('ADMIN');
    const rec = await bomApi.updateBomMaterial(material.id, { quantity: 4, ratePerUnit: 1 });
    expect(state.materials[0].quantity).toBe(4);
    expect(state.materials[0].ratePerUnit).toBe(500);
    expect(rec).not.toHaveProperty('ratePerUnit');
    expect(JSON.stringify(rec)).not.toContain('500');
  });

  it('is behind orders.write', async () => {
    const { material } = await seedBom();
    getMisRole.mockResolvedValue('QC');
    await expect(bomApi.updateBomMaterial(material.id, { quantity: 4 })).rejects.toThrow();
  });
});
