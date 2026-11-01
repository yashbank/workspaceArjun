/**
 * R2-313: the defect-type code is unique across soft-deleted rows, so re-creating a deleted code
 * used to throw P2002. Now it restores the deleted row with the new details.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state: { rows: Row[]; audits: Row[] } = { rows: [], audits: [] };
let seq = 0;
const p2002 = () => Object.assign(new Error('Unique constraint failed on the fields: (`code`)'), { code: 'P2002', meta: { target: ['code'] } });

vi.mock('@/server/db', () => ({
  db: {
    misDefectType: {
      findFirst: async ({ where }: Row) => {
        const w = where as { code: string; deletedAt: { not: null } };
        return state.rows.find((r) => r.code === w.code && r.deletedAt !== null) ?? null;
      },
      create: async ({ data }: Row) => {
        const d = data as Row;
        if (state.rows.some((r) => r.code === d.code)) throw p2002();
        const row = { id: `d${++seq}`, deletedAt: null, isActive: true, ...d };
        state.rows.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        const row = state.rows.find((r) => r.id === (where as Row).id)!;
        Object.assign(row, data);
        return { ...row };
      },
    },
  },
}));
const getCurrentUser = vi.fn(async () => ({ id: 'u1' }));
vi.mock('@/server/auth', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'ADMIN' }));
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(e); } }));

const { createDefectType } = await import('./defect-type');

beforeEach(() => {
  state.rows = [];
  state.audits = [];
  seq = 0;
});

describe('R2-313 createDefectType and a soft-deleted code', () => {
  it('restores the deleted row with the new details instead of throwing', async () => {
    state.rows.push({ id: 'old', code: 'STAIN', name: 'Stain', severity: 'MINOR', sortOrder: 3, deletedAt: new Date('2026-01-01'), isActive: false });
    const out = await createDefectType({ code: ' stain ', name: 'Ink stain', severity: 'MAJOR' });
    expect(out).toMatchObject({ id: 'old', code: 'STAIN', name: 'Ink stain', severity: 'MAJOR', deletedAt: null, isActive: true });
    expect(state.rows).toHaveLength(1);
    expect(state.audits.at(-1)).toMatchObject({ action: 'defectType.restore', entityId: 'old' });
  });

  it('an active duplicate still fails with the unique error the action turns into a friendly message', async () => {
    state.rows.push({ id: 'live', code: 'STAIN', name: 'Stain', severity: 'MINOR', deletedAt: null, isActive: true });
    await expect(createDefectType({ code: 'STAIN', name: 'Again', severity: 'MINOR' })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a new code is created as before', async () => {
    const out = await createDefectType({ code: 'tear', name: 'Tear', severity: 'MAJOR' });
    expect(out).toMatchObject({ code: 'TEAR', name: 'Tear' });
    expect(state.audits.at(-1)).toMatchObject({ action: 'defectType.create' });
  });
});
