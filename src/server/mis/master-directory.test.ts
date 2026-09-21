/**
 * Phase 24E · D10 — the master directory at the SERVER FUNCTION.
 *
 * Reading is `masters.read` (OWNER, ADMIN, SUPERVISOR, QC); writing is `masters.write` (OWNER, ADMIN). A refused
 * role costs no query and writes nothing. Every write goes through the master's own `createX` / `updateX` /
 * `deleteX` / `restoreX`, so the audit row is asserted. Code is never in an update. No price anywhere (D24).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown> & { id: string; deletedAt: Date | null; createdAt: Date };
const calls: string[] = [];
const audits: Row[] = [];
const writes: { table: string; op: string; data: Row }[] = [];
const tables: Record<string, Row[]> = {};

const fakeTable = (name: string) => ({
  findMany: async (args?: { where?: { deletedAt?: null; group?: string } }) => {
    calls.push(`${name}.findMany`);
    return (tables[name] ?? []).filter((r) => (!args?.where || args.where.deletedAt !== null || r.deletedAt === null) && (!args?.where?.group || r.group === args.where.group));
  },
  count: async (args?: { where?: { group?: string; deletedAt?: { not: null } } }) => {
    calls.push(`${name}.count`);
    return (tables[name] ?? []).filter((r) => (!args?.where?.group || r.group === args.where.group) && (!args?.where?.deletedAt || r.deletedAt !== null)).length;
  },
  findUnique: async (args: { where: { id: string } }) => (tables[name] ?? []).find((r) => r.id === args.where.id) ?? null,
  findFirst: async () => null,
  create: async ({ data }: { data: Row }) => {
    writes.push({ table: name, op: 'create', data });
    return { ...data, id: `new-${name}`, deletedAt: (data.deletedAt as Date | null | undefined) ?? null, createdAt: new Date() };
  },
  update: async ({ where, data }: { where: { id: string }; data: Row }) => {
    writes.push({ table: name, op: 'update', data });
    return { ...((tables[name] ?? []).find((r) => r.id === where.id) ?? {}), ...data };
  },
});

vi.mock('@/server/db', () => ({
  db: {
    misDepartment: fakeTable('dept'),
    misMachine: fakeTable('machine'),
    misProcess: fakeTable('process'),
    misCustomer: fakeTable('customer'),
    misItem: fakeTable('item'),
    misDefectType: fakeTable('defect'),
    misMasterOption: fakeTable('option'),
    misAuditLog: { create: async ({ data }: { data: Row }) => { audits.push(data as Row); return data; } },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { getMasterDirectory, getMasterList, saveMaster, setMasterDeactivated } = await import('./master-directory');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const WRITERS: MisRoleName[] = ['OWNER', 'ADMIN'];
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};
const denied = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).name === 'MisForbiddenError';
  }
};
const row = (id: string, over: Record<string, unknown> = {}): Row => ({ id, deletedAt: null, createdAt: new Date('2024-03-12T00:00:00Z'), ...over });

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  audits.length = 0;
  writes.length = 0;
  for (const k of Object.keys(tables)) delete tables[k];
  tables.dept = [row('d1', { code: 'PRINT', name: 'Printing', nameHi: 'प्रिंटिंग' }), row('d2', { code: 'PACK', name: 'Packaging', nameHi: null })];
  tables.machine = [
    row('m1', { code: 'MC-HD74', name: 'Heidelberg SM 74', departmentId: 'd1', department: { id: 'd1', name: 'Printing' }, machineType: 'Offset', capacityPerDay: 40000, sortOrder: 0 }),
    row('m2', { code: 'MC-PL115', name: 'Polar 115 Cutter', departmentId: 'd1', department: { id: 'd1', name: 'Printing' }, machineType: null, capacityPerDay: null }),
    row('m3', { code: 'MC-CORR1', name: 'Corrugation Line 1', departmentId: null, department: null, machineType: null, capacityPerDay: null, deletedAt: new Date('2026-04-01T00:00:00Z') }),
  ];
  tables.item = [row('i1', { code: 'RM-FBB', name: 'FBB 300 gsm', unit: 'KG', gsm: '300', pricePerUnit: 88.41 })];
  tables.defect = [row('x1', { code: 'MISREG', name: 'Mis-registration', nameHi: '', severity: 'MAJOR' })];
  tables.option = [row('o1', { group: 'UNIT', label: 'Sheets', labelHi: null }), row('o2', { group: 'GSM', label: '300' })];
  tables.customer = [];
  tables.process = [];
});

describe('reading — masters.read', () => {
  it.each(READERS)('%s is served the directory and a list', async (role) => {
    as(role);
    const dir = await getMasterDirectory();
    expect(dir.find((d) => d.key === 'machines')!.counts).toEqual({ total: 3, active: 2, deactivated: 1 });
    expect((await getMasterList('machines')).rows).toHaveLength(2);
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is REFUSED both reads — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getMasterDirectory())).toBe(true);
    expect(await denied(() => getMasterList('machines'))).toBe(true);
    expect(calls).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => getMasterList('machines'))).toBe(true);
    expect(calls).toEqual([]);
  });

  it('an unknown master is an error, not an empty list', async () => {
    as('OWNER');
    await expect(getMasterList('nope')).rejects.toThrow('Unknown master');
    await expect(getMasterList(['machines'])).rejects.toThrow('Unknown master');
  });

  it.each(READERS)('%s: there is no price, rate or wage in any list or in the directory (D24)', async (role) => {
    as(role);
    const text = JSON.stringify([await getMasterDirectory(), await getMasterList('items'), await getMasterList('machines'), await getMasterList('defect-types')]);
    expect(text).not.toMatch(/price|pricePerUnit|88\.41|wage|salary|₹/i);
  });
});

describe('the list', () => {
  it('states total, active and deactivated, and hides deactivated rows until asked', async () => {
    as('OWNER');
    const hidden = await getMasterList('machines');
    expect(hidden.counts).toEqual({ total: 3, active: 2, deactivated: 1 });
    expect(hidden.rows.map((r) => r.code)).toEqual(['MC-HD74', 'MC-PL115']);
    const shown = await getMasterList('machines', { deactivated: '1' });
    expect(shown.rows.map((r) => [r.code, r.deactivated])).toEqual([['MC-HD74', false], ['MC-PL115', false], ['MC-CORR1', true]]);
    expect(shown.showDeactivated).toBe(true);
  });

  it('a deactivated row is still in the data — nothing is ever deleted', async () => {
    as('OWNER');
    expect((await getMasterList('machines', { deactivated: '1' })).rows.find((r) => r.code === 'MC-CORR1')).toMatchObject({ name: 'Corrugation Line 1', deactivated: true });
  });

  it('search matches the code and the name, on the server', async () => {
    as('OWNER');
    expect((await getMasterList('machines', { q: 'polar' })).rows.map((r) => r.code)).toEqual(['MC-PL115']);
    expect((await getMasterList('machines', { q: 'hd74' })).rows.map((r) => r.code)).toEqual(['MC-HD74']);
    expect((await getMasterList('machines', { q: 'zzz' })).rows).toEqual([]);
  });

  it('a master WITH a Hindi name says "not set" as null; one WITHOUT has no such key at all', async () => {
    as('OWNER');
    const depts = await getMasterList('departments');
    expect(depts.rows.find((r) => r.code === 'PACK')).toHaveProperty('nameHi', null);
    expect(depts.rows.find((r) => r.code === 'PRINT')!.nameHi).toBe('प्रिंटिंग');
    const defects = await getMasterList('defect-types');
    expect(defects.rows[0].nameHi).toBeNull(); // '' counts as not set
    for (const r of (await getMasterList('machines')).rows) expect('nameHi' in r).toBe(false);
    for (const r of (await getMasterList('items')).rows) expect('nameHi' in r).toBe(false);
  });

  it('columns carry the department and type; an option master is scoped to its own group', async () => {
    as('OWNER');
    expect((await getMasterList('machines')).rows[0].cells).toEqual({ department: 'Printing', machineType: 'Offset' });
    expect((await getMasterList('option-unit')).rows.map((r) => r.name)).toEqual(['Sheets']);
    expect((await getMasterList('option-gsm')).rows.map((r) => r.name)).toEqual(['300']);
  });

  it('shows at most 50 rows and says how many matched', async () => {
    as('OWNER');
    tables.machine = Array.from({ length: 60 }, (_, i) => row(`m${i}`, { code: `MC-${i}`, name: `Machine ${i}`, department: null }));
    const v = await getMasterList('machines');
    expect(v.rows).toHaveLength(50);
    expect(v.matched).toBe(60);
    expect(v.counts.total).toBe(60);
  });

  it('the row being edited comes with its values; an unknown id opens nothing; create opens an empty form', async () => {
    as('OWNER');
    const e = (await getMasterList('machines', { edit: 'm1' })).editing!;
    expect(e).toMatchObject({ id: 'm1', deactivated: false, values: { code: 'MC-HD74', name: 'Heidelberg SM 74', departmentId: 'd1', machineType: 'Offset', capacityPerDay: '40000' } });
    expect((await getMasterList('machines', { edit: 'ghost' })).editing).toBeNull();
    expect((await getMasterList('machines', { create: '1' })).editing).toMatchObject({ id: null, values: { code: '', name: '' } });
  });

  it('a role that may not write is never handed an edit form, whatever the URL says', async () => {
    as('SUPERVISOR');
    const v = await getMasterList('machines', { edit: 'm1', create: '1' });
    expect(v.canWrite).toBe(false);
    expect(v.editing).toBeNull();
  });

  it('an error handed back by a failed action is plain, capped text', async () => {
    as('OWNER');
    expect((await getMasterList('machines', { error: 'Capacity must be a number' })).error).toBe('Capacity must be a number');
    expect((await getMasterList('machines', { error: 'x'.repeat(500) })).error).toHaveLength(200);
    expect((await getMasterList('machines', { error: ['a'] })).error).toBeNull();
    expect((await getMasterList('machines')).error).toBeNull();
  });

  it('array-valued params are ignored, not a crash', async () => {
    as('OWNER');
    const v = await getMasterList('machines', { q: ['x'], deactivated: ['1'], edit: ['m1'] });
    expect(v).toMatchObject({ query: '', showDeactivated: false, editing: null });
  });
});

describe('writing — masters.write, always audited', () => {
  it.each(WRITERS)('%s may create; the row is written and audited', async (role) => {
    as(role);
    await saveMaster('machines', null, { code: 'mc-new', name: 'New Machine', departmentId: 'd1', machineType: '', capacityPerDay: '' });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: 'machine', op: 'create', data: { code: 'MC-NEW', name: 'New Machine' } });
    expect(audits.map((a) => a.action)).toEqual(['machine.create']);
  });

  it.each(MIS_ROLES.filter((r) => !WRITERS.includes(r)))('%s is REFUSED every write — and nothing is written', async (role) => {
    as(role);
    expect(await denied(() => saveMaster('machines', null, { code: 'X', name: 'X' }))).toBe(true);
    expect(await denied(() => saveMaster('machines', 'm1', { name: 'X' }))).toBe(true);
    expect(await denied(() => setMasterDeactivated('machines', 'm1', true))).toBe(true);
    expect(writes).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('an UPDATE never carries the code — even if the browser posts one — and is audited', async () => {
    as('OWNER');
    await saveMaster('machines', 'm1', { code: 'HACKED', name: 'Renamed', departmentId: 'd1', machineType: 'Offset', capacityPerDay: '' });
    expect(writes).toHaveLength(1);
    expect(writes[0].data).not.toHaveProperty('code');
    expect(writes[0].data).toMatchObject({ name: 'Renamed' });
    expect(audits.map((a) => a.action)).toEqual(['machine.update']);
  });

  it('a field that is not on the form is never written (isActive, deletedAt, a price)', async () => {
    as('OWNER');
    await saveMaster('items', 'i1', { name: 'FBB', unit: 'KG', isActive: 'false', deletedAt: 'x', pricePerUnit: '9' });
    expect(writes[0].data).not.toHaveProperty('pricePerUnit');
    expect(writes[0].data).not.toHaveProperty('isActive');
    expect(writes[0].data).not.toHaveProperty('deletedAt');
  });

  it('an empty required field is refused before anything is written; a create needs its code', async () => {
    as('OWNER');
    await expect(saveMaster('machines', null, { code: '', name: 'X' })).rejects.toThrow('Code is required.');
    await expect(saveMaster('machines', 'm1', { name: '  ' })).rejects.toThrow('Name is required.');
    await expect(saveMaster('defect-types', null, { code: 'C', name: 'N', severity: '' })).rejects.toThrow('Severity is required.');
    expect(writes).toEqual([]);
  });

  it('a whole-number column refuses a fraction (the database column is an integer)', async () => {
    as('OWNER');
    tables.process = [row('p1', { code: 'PR', name: 'Print', department: null })];
    await expect(saveMaster('processes', 'p1', { name: 'Print', standardTimeMinutes: '1.5' })).rejects.toThrow('Standard time must be a whole number.');
    await saveMaster('processes', 'p1', { name: 'Print', standardTimeMinutes: '45' });
    expect(writes.at(-1)!.data.standardTimeMinutes).toBe(45);
  });

  it('an error names the field by its LABEL, not its key', async () => {
    as('OWNER');
    await expect(saveMaster('option-unit', null, { label: '' })).rejects.toThrow('Name is required.');
    await expect(saveMaster('defect-types', null, { code: 'C', name: 'N', severity: '' })).rejects.toThrow('Severity is required.');
  });

  it('a non-numeric capacity is refused', async () => {
    as('OWNER');
    await expect(saveMaster('machines', 'm1', { name: 'X', capacityPerDay: 'lots' })).rejects.toThrow(/must be a number/);
    expect(writes).toEqual([]);
  });

  it('deactivating a row that is already deactivated (or reactivating an active one) writes and audits nothing', async () => {
    as('OWNER');
    await setMasterDeactivated('machines', 'm3', true); // m3 is already deactivated
    await setMasterDeactivated('machines', 'm1', false); // m1 is already active
    expect(writes).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('a row that does not exist is a clear error, not a silent write', async () => {
    as('OWNER');
    await expect(setMasterDeactivated('machines', 'ghost', true)).rejects.toThrow('That row no longer exists.');
    expect(writes).toEqual([]);
  });

  it('deactivate sets deletedAt (never removes the row) and is audited; reactivate clears it', async () => {
    as('OWNER');
    await setMasterDeactivated('machines', 'm1', true);
    expect(writes[0]).toMatchObject({ table: 'machine', op: 'update' });
    expect(writes[0].data.deletedAt).toBeInstanceOf(Date);
    await setMasterDeactivated('machines', 'm3', false);
    expect(writes[1].data.deletedAt).toBeNull();
    expect(audits).toHaveLength(2);
  });

  it('an option master saves through createOption/updateOption (its own audit)', async () => {
    as('ADMIN');
    await saveMaster('option-unit', null, { label: 'Reams', labelHi: '' });
    expect(writes.at(-1)).toMatchObject({ table: 'option', op: 'create' });
    expect(audits.at(-1)!.action).toMatch(/master_option\.create/);
  });

  it('an unknown master or a non-string key is refused', async () => {
    as('OWNER');
    await expect(saveMaster('nope', null, { code: 'x', name: 'y' })).rejects.toThrow('Unknown master');
    await expect(saveMaster({} as never, null, {})).rejects.toThrow('Unknown master');
    await expect(setMasterDeactivated('nope', 'x', true)).rejects.toThrow('Unknown master');
  });
});
