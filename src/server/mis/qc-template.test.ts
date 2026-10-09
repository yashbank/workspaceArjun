/**
 * V2 Epic 5 — templates are Owner/Admin-only to edit, QC-readable; a tap becomes an ordinary QC
 * check with the paper form's status mapped onto result/defectType; seeding never duplicates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const state: { templates: Row[]; checks: Row[] } = { templates: [], checks: [] };
const T = { id: 't1', name: 'Printing 6-Colours', processName: 'Printing', slotStart: '09:15', slotEnd: '18:00', parameters: ['Shade', 'Registration'], isActive: true, sortOrder: 0, deletedAt: null };

vi.mock('@/server/db', () => ({
  db: {
    misQcTemplate: {
      findMany: async () => state.templates,
      findUnique: async ({ where }: Row) => state.templates.find((t) => t.id === where.id) ?? null,
      create: async ({ data }: Row) => { const row = { id: `t${state.templates.length + 1}`, isActive: true, sortOrder: 0, ...data }; state.templates.push(row); return row; },
      update: async ({ where, data }: Row) => { const row = state.templates.find((t) => t.id === where.id)!; Object.assign(row, data); return row; },
      createMany: async ({ data }: Row) => { state.templates.push(...data.map((d: Row, i: number) => ({ id: `s${i}`, ...d }))); return { count: data.length }; },
    },
    misQcCheck: { create: async ({ data }: Row) => { const row = { id: 'c1', ...data }; state.checks.push(row); return row; } },
    misOrder: { findUnique: async () => ({ orderNumber: 'ORD-1' }) },
  },
}));
vi.mock('./audit', () => ({ logAuditEvent: async () => undefined }));
vi.mock('@/server/notifications', () => ({ notifySupervisorsOfQcDefect: async () => undefined }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { createQcTemplate, listQcTemplates, recordChecklistCheck, seedQcTemplates } = await import('./qc-template');

beforeEach(() => {
  vi.clearAllMocks();
  state.templates = [{ ...T, parameters: [...T.parameters] }]; state.checks = [];
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('QC');
});

describe('gates', () => {
  it('QC can list and tap, but not create', async () => {
    expect((await listQcTemplates()).map((t) => t.slots.length)).toEqual([10]);
    await expect(createQcTemplate({ name: 'X', parameters: ['a'] })).rejects.toThrow(/Not permitted/);
  });
  it('ADMIN creates; a template with no parameters or a bad slot range is refused', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await expect(createQcTemplate({ name: 'X', parameters: [' '] })).rejects.toThrow(/parameter/);
    await expect(createQcTemplate({ name: 'X', parameters: ['a'], slotStart: '18:00', slotEnd: '09:00' })).rejects.toThrow(/before/);
    expect((await createQcTemplate({ name: ' X ', parameters: ['a', '', 'b'] })).parameters).toEqual(['a', 'b']);
  });
});

describe('a tap is a QC check', () => {
  it.each([
    ['PASS', { result: 'PASS' }],
    ['PLATE_ERR', { result: 'FAIL', defectType: 'PLATE_ERR' }],
    ['MAKE_READY', { result: 'NA' }],
  ] as const)('%s lands as %o, carrying template and slot', async (status, expected) => {
    await recordChecklistCheck({ orderId: 'o1', templateId: 't1', parameterName: 'Shade', slotTime: '10:00', status });
    expect(state.checks[0]).toMatchObject({ ...expected, parameterName: 'Shade', templateId: 't1', slotTime: '10:00', orderId: 'o1' });
  });
  it('a retired form takes no taps', async () => {
    state.templates[0].isActive = false;
    await expect(recordChecklistCheck({ orderId: 'o1', templateId: 't1', parameterName: 'Shade', slotTime: '10:00', status: 'PASS' })).rejects.toThrow(/no longer active/);
  });
  it('refuses a parameter or slot that is not on the form', async () => {
    await expect(recordChecklistCheck({ orderId: 'o1', templateId: 't1', parameterName: 'Nope', slotTime: '10:00', status: 'PASS' })).rejects.toThrow(/parameter/);
    await expect(recordChecklistCheck({ orderId: 'o1', templateId: 't1', parameterName: 'Shade', slotTime: '10:30', status: 'PASS' })).rejects.toThrow(/slot/);
    expect(state.checks).toHaveLength(0);
  });
});

describe('seed', () => {
  it('adds only the missing paper forms, and is a no-op the second time', async () => {
    getMisRole.mockResolvedValue('OWNER');
    expect(await seedQcTemplates()).toEqual({ created: 3 });
    expect(state.templates.map((t) => t.name)).toEqual(['Printing 6-Colours', 'Lamination', 'Lamif Flute', 'Die Cutting']);
    expect(await seedQcTemplates()).toEqual({ created: 0 });
  });
});
