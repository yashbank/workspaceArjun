/**
 * R3-MST B26 / B27 / B28 — PO line validation, OWNER-only purchase rates, submit requirements and
 * compare-and-set status transitions, against an in-memory db with the live NOT NULL rate column and
 * Prisma's P2025 on a non-matching `where`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;

const state: { pos: Row[]; lines: Row[]; grns: Row[]; items: Row[] } = { pos: [], lines: [], grns: [], items: [] };
let seq = 0;
const nextId = () => `id-${++seq}`;
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });
/** When set, `findUnique` on a PO returns this older snapshot: another user has already moved the real row. */
let staleSnapshot: Row | null = null;

const p2025 = () => Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v || (v === null && row[k] == null));

const db: Row = {
  misPurchaseOrder: {
    create: async ({ data }: Row) => { const row = { id: nextId(), status: 'DRAFT', ...data }; state.pos.push(row); return row; },
    findUnique: async ({ where }: Row) => {
      const row = state.pos.find((p) => p.id === where.id);
      return row ? { ...(staleSnapshot ?? row) } : null;
    },
    update: async ({ where, data }: Row) => {
      const row = state.pos.find((p) => matches(p, where));
      if (!row) throw p2025();
      Object.assign(row, data);
      return { ...row };
    },
  },
  misPoItem: {
    create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.lines.push(row); return row; },
    findFirst: async () => null,
    findUnique: async ({ where }: Row) => state.lines.find((l) => l.id === where.id) ?? null,
    findMany: async ({ where }: Row) =>
      state.lines.filter((l) => l.poId === where.poId).sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({ ...l, quantity: D(l.quantity), ratePerUnit: D(l.ratePerUnit) })),
    update: async ({ where, data }: Row) => { const row = state.lines.find((l) => l.id === where.id)!; Object.assign(row, data); return { ...row }; },
  },
  misItem: { findFirst: async ({ where }: Row) => state.items.find((i) => i.id === where.id && i.isActive && !i.deletedAt) ?? null },
  misGrn: { count: async ({ where }: Row) => state.grns.filter((g) => g.poId === where.poId).length },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => cb(db),
};
vi.mock('@/server/db', () => ({ db }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/mis/business-rules', () => ({ getPoApprovalThreshold: async () => 50000 }));

const po = await import('./po');

const as = (role: string) => getMisRole.mockResolvedValue(role);

beforeEach(() => {
  seq = 0; state.pos = []; state.lines = []; state.grns = [];
  state.items = [{ id: 'i1', isActive: true, deletedAt: null }, { id: 'i2', isActive: false, deletedAt: null }, { id: 'i3', isActive: true, deletedAt: new Date() }];
  staleSnapshot = null;
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  as('ADMIN');
});

const draft = async () => po.createPO({ purpose: 'BUFFER_STOCK', supplierId: 's1' });
const line = (poId: string, over: Row = {}) => po.addPOItem(poId, { itemId: 'i1', description: 'Kraft', quantity: 5, ratePerUnit: 10, ...over });

describe('B26 purchase rates are OWNER-only to write', () => {
  it('an ADMIN-entered rate is ignored: the line is stored unpriced', async () => {
    const p = await draft();
    await line(p.id, { ratePerUnit: 0.01 });
    expect(state.lines[0].ratePerUnit).toBe(0);
  });

  it('the OWNER keeps the rate', async () => {
    as('OWNER');
    const p = await draft();
    await line(p.id, { ratePerUnit: 0.01 });
    expect(state.lines[0].ratePerUnit).toBe(0.01);
  });

  it('an ADMIN update that carries a rate leaves the OWNER rate unchanged', async () => {
    as('OWNER');
    const p = await draft();
    await line(p.id, { ratePerUnit: 42 });
    as('ADMIN');
    await po.updatePOItem(state.lines[0].id, { quantity: 7, ratePerUnit: 1 });
    expect(state.lines[0].ratePerUnit).toBe(42);
    expect(state.lines[0].quantity).toBe(7);
  });
});

describe('B26 line validation', () => {
  it.each([[-50], [0], [Number.NaN], [Number.POSITIVE_INFINITY]])('quantity %s is refused on add and on update', async (q) => {
    const p = await draft();
    await expect(line(p.id, { quantity: q })).rejects.toThrow(/quantity/i);
    await line(p.id);
    await expect(po.updatePOItem(state.lines[0].id, { quantity: q })).rejects.toThrow(/quantity/i);
    expect(state.lines).toHaveLength(1);
  });

  it('quantity is rounded to 2 dp', async () => {
    const p = await draft();
    await line(p.id, { quantity: 2.499 });
    expect(state.lines[0].quantity).toBe(2.5);
  });

  it('a blank description is refused; a padded one is trimmed', async () => {
    const p = await draft();
    await expect(line(p.id, { description: '   ' })).rejects.toThrow(/description/i);
    await line(p.id, { description: '  Kraft  ' });
    expect(state.lines[0].description).toBe('Kraft');
  });

  it('an inactive or deleted item is refused with a friendly message', async () => {
    const p = await draft();
    await expect(line(p.id, { itemId: 'i2' })).rejects.toThrow(/inactive or has been deleted/);
    await expect(line(p.id, { itemId: 'i3' })).rejects.toThrow(/inactive or has been deleted/);
    await expect(line(p.id, { itemId: 'nope' })).rejects.toThrow(/inactive or has been deleted/);
    expect(state.lines).toHaveLength(0);
  });
});

describe('B26 approval mode with unpriced lines', () => {
  it('a PO with an unpriced line submits as BOTH (the Owner must sign and price it)', async () => {
    const p = await draft();
    await line(p.id, { ratePerUnit: 5 }); // ADMIN: stored as 0
    expect((await po.submitForApproval(p.id)).approvalMode).toBe('BOTH');
  });

  it('a fully priced low-value PO is still ADMIN_ONLY', async () => {
    as('OWNER');
    const p = await draft();
    await line(p.id, { ratePerUnit: 5 });
    as('ADMIN');
    expect((await po.submitForApproval(p.id)).approvalMode).toBe('ADMIN_ONLY');
  });
});

describe('B27 submit requirements', () => {
  it('a PO without a supplier is refused', async () => {
    const p = await po.createPO({ purpose: 'BUFFER_STOCK' });
    await line(p.id);
    await expect(po.submitForApproval(p.id)).rejects.toThrow(/supplier/i);
    expect(state.pos[0].status).toBe('DRAFT');
  });

  it('a line without an item is refused and the message names the first such line', async () => {
    const p = await draft();
    await line(p.id);
    await line(p.id, { itemId: null, description: 'Loose glue' });
    await line(p.id, { itemId: null, description: 'Loose tape' });
    await expect(po.submitForApproval(p.id)).rejects.toThrow(/Line 2 \("Loose glue"\) has no item/);
    expect(state.pos[0].status).toBe('DRAFT');
  });
});

describe('B28 compare-and-set transitions', () => {
  const submitted = async (role = 'ADMIN') => {
    as('OWNER'); // the OWNER prices the line, so the PO is ADMIN_ONLY and one approval finishes it
    const p = await draft();
    await line(p.id);
    await po.submitForApproval(p.id);
    as(role);
    return p;
  };

  it('a double approve leaves the first approval stamp intact', async () => {
    const p = await submitted();
    const first = await po.approvePO(p.id);
    expect(first.status).toBe('APPROVED');
    const stamp = { by: state.pos[0].approvedById, at: state.pos[0].approvedAt };
    // The second caller read the PO while it was still pending.
    staleSnapshot = { ...state.pos[0], status: 'PENDING_APPROVAL' };
    as('OWNER');
    getCurrentUser.mockResolvedValue({ id: 'u2' });
    await expect(po.approvePO(p.id)).rejects.toThrow('This PO was changed by someone else. Refresh and try again.');
    expect({ by: state.pos[0].approvedById, at: state.pos[0].approvedAt }).toEqual(stamp);
  });

  it('a stale submit is refused and the PO is not overwritten', async () => {
    const p = await draft();
    await line(p.id);
    staleSnapshot = { ...state.pos[0], status: 'DRAFT' };
    state.pos[0].status = 'CANCELLED';
    await expect(po.submitForApproval(p.id)).rejects.toThrow(/changed by someone else/);
    expect(state.pos[0].status).toBe('CANCELLED');
  });

  it('a stale header edit is refused', async () => {
    const p = await draft();
    staleSnapshot = { ...state.pos[0], status: 'DRAFT' };
    state.pos[0].status = 'PENDING_APPROVAL';
    await expect(po.updatePO(p.id, { notes: 'late' })).rejects.toThrow(/changed by someone else/);
    expect(state.pos[0].notes).toBeNull();
  });

  it('cancel after a GRN appears is refused and the status is untouched', async () => {
    const p = await submitted();
    await po.approvePO(p.id);
    state.grns.push({ id: 'g1', poId: p.id });
    await expect(po.cancelPO(p.id)).rejects.toThrow(/goods receipt/i);
    expect(state.pos[0].status).toBe('APPROVED');
  });

  it('a stale cancel is refused', async () => {
    const p = await draft();
    staleSnapshot = { ...state.pos[0], status: 'DRAFT' };
    state.pos[0].status = 'APPROVED';
    await expect(po.cancelPO(p.id)).rejects.toThrow(/changed by someone else/);
    expect(state.pos[0].status).toBe('APPROVED');
  });
});

describe('B31 PO actions return refusals as values', () => {
  it('addPoItemAction on a submitted PO is { ok: false }, not a throw', async () => {
    const { addPoItemAction } = await import('@/app/(mis)/mis/po/actions');
    const p = await draft();
    await line(p.id);
    await po.submitForApproval(p.id);
    const r = await addPoItemAction(p.id, { itemId: 'i1', description: 'x', quantity: 1, ratePerUnit: 1 });
    expect(r).toMatchObject({ ok: false, detail: expect.stringMatching(/not a draft/i) });
  });
});
