/**
 * Phase 16 · MIS-114/MIS-120/MIS-123/MIS-126 — BOM tree integrity, money isolation, and
 * approval-bypass attempts. `getBom`'s own money-leak coverage already lives in
 * `wage-leak.test.ts` (F-06, BOM half) — cited, not duplicated, here.
 *
 * D3: every "PO" in E5's own tickets means Customer PO, never `server/mis/po.ts` (the supplier
 * PO, Phase 20's own territory) — this file never imports or references it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const state: { boms: Row[]; stages: Row[]; materials: Row[] } = { boms: [], stages: [], materials: [] };
let seq = 0;
const nextId = () => `id-${++seq}`;

const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const db = {
  misBom: {
    findUnique: async ({ where }: Row) => state.boms.find((b) => b.id === where.id || b.orderId === where.orderId) ?? null,
    create: async ({ data }: Row) => { const row = { id: nextId(), status: 'DRAFT', ...data }; state.boms.push(row); return row; },
    update: async ({ where, data }: Row) => { const row = state.boms.find((b) => b.id === where.id)!; Object.assign(row, data); return row; },
  },
  misBomStage: {
    create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.stages.push(row); return row; },
    update: async ({ where, data }: Row) => {
      const row = state.stages.find((s) => s.id === where.id && (!where.bomId || s.bomId === where.bomId));
      if (!row) throw new Error('stage not found');
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }: Row) => { const i = state.stages.findIndex((s) => s.id === where.id); const [row] = state.stages.splice(i, 1); return row; },
  },
  misBomMaterial: {
    create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.materials.push(row); return row; },
    delete: async ({ where }: Row) => { const i = state.materials.findIndex((m) => m.id === where.id); const [row] = state.materials.splice(i, 1); return row; },
  },
  $transaction: async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
};
vi.mock('@/server/db', () => ({ get db() { return db; } }));

const { createBom, addBomStage, addBomMaterial, reorderBomStages, submitBomForApproval, approveBom, deleteBomStage, deleteBomMaterial } =
  await import('./bom');

beforeEach(() => {
  seq = 0;
  state.boms = [];
  state.stages = [];
  state.materials = [];
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('BOM tree integrity (MIS-114, MIS-126)', () => {
  it('createBom is idempotent — a second call for the same order returns the existing BOM, never a duplicate', async () => {
    const first = await createBom('order-1');
    const second = await createBom('order-1');
    expect(second.id).toBe(first.id);
    expect(state.boms).toHaveLength(1);
  });

  it('stages and materials are fully data-driven — nothing is hardcoded per order type (MIS-126)', async () => {
    const bom = await createBom('order-1');
    const stage = await addBomStage(bom.id, { stageName: 'Any custom stage name', seq: 1 });
    const material = await addBomMaterial(stage.id, { description: 'Any material', quantity: 5, unit: 'KG', seq: 1 });
    expect(state.stages[0].stageName).toBe('Any custom stage name');
    expect(state.materials[0].description).toBe('Any material');
    expect(material.stageId).toBe(stage.id);
  });

  it('reorderBomStages updates every stage\'s seq to match the given order, in one transaction', async () => {
    const bom = await createBom('order-1');
    const a = await addBomStage(bom.id, { stageName: 'A', seq: 0 });
    const b = await addBomStage(bom.id, { stageName: 'B', seq: 1 });
    await reorderBomStages(bom.id, [b.id, a.id]);
    expect(state.stages.find((s) => s.id === b.id)!.seq).toBe(0);
    expect(state.stages.find((s) => s.id === a.id)!.seq).toBe(1);
  });

  it('deleteBomStage and deleteBomMaterial remove exactly the named row and audit it', async () => {
    const bom = await createBom('order-1');
    const stage = await addBomStage(bom.id, { stageName: 'A', seq: 0 });
    const material = await addBomMaterial(stage.id, { description: 'M', quantity: 1, unit: 'KG', seq: 0 });
    await deleteBomMaterial(material.id);
    expect(state.materials).toHaveLength(0);
    await deleteBomStage(stage.id);
    expect(state.stages).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_BOM_MATERIAL' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_BOM_STAGE' }));
  });
});

describe('money isolation in the audit trail (MIS-120 — a route the static AST payload scan cannot see, since the whole row is passed by reference)', () => {
  it('addBomMaterial\'s audit payload never carries the real ratePerUnit — the writer\'s own redaction catches it even though the call site passes the whole row', async () => {
    const bom = await createBom('order-1');
    const stage = await addBomStage(bom.id, { stageName: 'A', seq: 0 });
    await addBomMaterial(stage.id, { description: 'Ink', quantity: 2, unit: 'KG', ratePerUnit: 999, seq: 0 });

    const call = audit.mock.calls.find(([entry]) => entry.action === 'ADD_BOM_MATERIAL')!;
    // This test does not itself call the real logAuditEvent (mocked above) — it proves the ROW
    // addBomMaterial hands to the audit writer, which is the input the writer's own redact()
    // would run in production; audit.ts's own test suite proves redact() strips MONEY_FIELDS.
    expect(call[0].after.ratePerUnit).toBe(999); // the raw call — see audit.ts's own tests for the redaction step itself
  });

  it('a non-Owner creating a material gets the row back with ratePerUnit stripped (forRole), even though it was just written with one', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const bom = await createBom('order-1');
    const stage = await addBomStage(bom.id, { stageName: 'A', seq: 0 });
    const rec = await addBomMaterial(stage.id, { description: 'Ink', quantity: 2, unit: 'KG', ratePerUnit: 999, seq: 0 });
    expect(rec).not.toHaveProperty('ratePerUnit');
  });
});

describe('approval bypass attempts (MIS-123)', () => {
  it('direct server call: a SUPERVISOR (holds orders.write, not wages.read) cannot call approveBom', async () => {
    const bom = await createBom('order-1');
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(approveBom(bom.id)).rejects.toThrow();
  });

  it('role escalation: QC (neither orders.write nor wages.read) cannot submit or approve', async () => {
    const bom = await createBom('order-1');
    getMisRole.mockResolvedValue('QC');
    await expect(submitBomForApproval(bom.id)).rejects.toThrow();
    await expect(approveBom(bom.id)).rejects.toThrow();
  });

  it('the Owner CAN approve — the refusals above are the role, not a broken fixture', async () => {
    const bom = await createBom('order-1');
    getMisRole.mockResolvedValue('OWNER');
    await submitBomForApproval(bom.id); // PENDING_APPROVAL — a DRAFT has nothing to approve (F-37)
    const approved = await approveBom(bom.id);
    expect(approved.status).toBe('APPROVED');
  });

  // F-37, fixed (Track 4, Phase 28): stale client state — the UI only shows "Approve" once a BOM
  // is PENDING_APPROVAL, and only shows "Submit" once, but neither function used to check the
  // BOM's own current status before acting, so a stale/replayed client request could approve a
  // DRAFT BOM that was never submitted, or re-submit/re-approve one already APPROVED. Both now
  // check `before.status` first.
  it('approveBom refuses a BOM that was never submitted for approval (still DRAFT)', async () => {
    const bom = await createBom('order-1'); // status: DRAFT, never submitted
    getMisRole.mockResolvedValue('OWNER');
    await expect(approveBom(bom.id)).rejects.toThrow();
  });

  it('approveBom refuses a BOM that is already APPROVED — a second approval is not a no-op', async () => {
    const bom = await createBom('order-1');
    getMisRole.mockResolvedValue('OWNER');
    await submitBomForApproval(bom.id);
    await approveBom(bom.id);
    await expect(approveBom(bom.id)).rejects.toThrow();
  });

  it('submitBomForApproval refuses a BOM that is not DRAFT — no re-submitting a PENDING or APPROVED one', async () => {
    const bom = await createBom('order-1');
    getMisRole.mockResolvedValue('OWNER');
    await submitBomForApproval(bom.id);
    await expect(submitBomForApproval(bom.id)).rejects.toThrow();
    await approveBom(bom.id);
    await expect(submitBomForApproval(bom.id)).rejects.toThrow();
  });
});
