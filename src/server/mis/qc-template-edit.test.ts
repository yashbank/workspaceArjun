/**
 * Template builder safety: reorder (templates and parameters), no rename that orphans recorded
 * checks, and activate/deactivate that verifies the row and audits before/after.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;
const state: { templates: Row[]; checks: Row[]; audits: Row[] } = { templates: [], checks: [], audits: [] };
const mk = (id: string, name: string, sortOrder: number, parameters: string[]): Row => ({ id, name, processName: null, slotStart: '09:15', slotEnd: '18:00', parameters, isActive: true, sortOrder, deletedAt: null });

vi.mock('@/server/db', () => {
  const update = async ({ where, data }: Row) => { const row = state.templates.find((t) => t.id === where.id)!; Object.assign(row, data); return row; };
  return {
    db: {
      misQcTemplate: {
        findMany: async () => [...state.templates].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        findUnique: async ({ where }: Row) => state.templates.find((t) => t.id === where.id) ?? null,
        update,
      },
      misQcCheck: {
        findMany: async ({ where }: Row) => state.checks.filter((c) => c.templateId === where.templateId && where.parameterName.in.includes(c.parameterName)).map((c) => ({ parameterName: c.parameterName })),
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  };
});
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(e); } }));
vi.mock('@/server/notifications', () => ({ notifySupervisorsOfQcDefect: async () => undefined }));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { moveQcParameter, moveQcTemplate, setQcTemplateActive, updateQcTemplate } = await import('./qc-template');

beforeEach(() => {
  state.templates = [mk('a', 'A', 0, ['p1', 'p2', 'p3']), mk('b', 'B', 0, ['q1']), mk('c', 'C', 0, ['r1'])];
  state.checks = []; state.audits = [];
  getMisRole.mockResolvedValue('ADMIN');
});

describe('reorder templates', () => {
  it('moves down even when every sortOrder is still the seeded tie, and audits the order', async () => {
    await moveQcTemplate('a', 'down');
    expect([...state.templates].sort((x, y) => x.sortOrder - y.sortOrder).map((t) => t.id)).toEqual(['b', 'a', 'c']);
    expect(state.audits[0]).toMatchObject({ action: 'qc_template.reorder', before: { order: ['a', 'b', 'c'] }, after: { order: ['b', 'a', 'c'] } });
  });
  it('moving the first one up is a no-op', async () => {
    state.templates.forEach((t, i) => { t.sortOrder = i; });
    await moveQcTemplate('a', 'up');
    expect(state.audits).toHaveLength(0);
  });
  it('is Owner/Admin only and refuses an unknown template', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(moveQcTemplate('a', 'down')).rejects.toThrow(/Not permitted/);
    getMisRole.mockResolvedValue('ADMIN');
    await expect(moveQcTemplate('zzz', 'down')).rejects.toThrow(/not found/);
  });
});

describe('reorder parameters', () => {
  it('swaps rows, keeps names, and audits before/after', async () => {
    const row = await moveQcParameter('a', 'p3', 'up');
    expect(row.parameters).toEqual(['p1', 'p3', 'p2']);
    expect(state.audits[0]).toMatchObject({ action: 'qc_template.reorder_parameters', before: { parameters: ['p1', 'p2', 'p3'] }, after: { parameters: ['p1', 'p3', 'p2'] } });
  });
  it('refuses a parameter that is not on the form and a non-admin', async () => {
    await expect(moveQcParameter('a', 'nope', 'up')).rejects.toThrow(/not on this template/);
    getMisRole.mockResolvedValue('QC');
    await expect(moveQcParameter('a', 'p1', 'down')).rejects.toThrow(/Not permitted/);
  });
});

describe('rename must not orphan history', () => {
  it('blocks renaming or removing a parameter that has recorded checks', async () => {
    state.checks = [{ templateId: 'a', parameterName: 'p2' }];
    await expect(updateQcTemplate('a', { name: 'A', parameters: ['p1', 'p2 renamed', 'p3'] })).rejects.toThrow(/"p2".*already recorded/);
    await expect(updateQcTemplate('a', { name: 'A', parameters: ['p1', 'p3'] })).rejects.toThrow(/"p2"/);
    expect(state.templates[0].parameters).toEqual(['p1', 'p2', 'p3']);
  });
  it('allows renaming an unused parameter, adding new ones and reordering used ones', async () => {
    state.checks = [{ templateId: 'a', parameterName: 'p2' }];
    const row = await updateQcTemplate('a', { name: 'A', parameters: ['p2', 'p1 renamed', 'p3', 'p4'] });
    expect(row.parameters).toEqual(['p2', 'p1 renamed', 'p3', 'p4']);
  });
});

describe('setQcTemplateActive', () => {
  it('refuses a missing template instead of throwing a raw DB error', async () => {
    await expect(setQcTemplateActive('zzz', false)).rejects.toThrow(/not found/);
    expect(state.audits).toHaveLength(0);
  });
  it('audits the before value', async () => {
    await setQcTemplateActive('a', false);
    expect(state.audits[0]).toMatchObject({ action: 'qc_template.deactivate', before: { isActive: true }, after: { isActive: false } });
  });
});
