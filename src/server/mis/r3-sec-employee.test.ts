/**
 * R3-SEC B33-B36, B41: wage fields are Owner-only on the server, the audit names the pay CODE,
 * an Owner's record is Owner-only, and every by-id employee function applies the D4 pool.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignableRoles } from '@/lib/mis/roles';

import { fakePeopleDb, rolesModule, seedPeople, world } from './testing/people-world';

vi.mock('@/server/db', () => ({ db: fakePeopleDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/server/mis/roles', () => ({
  getMisRole: (id: string) => rolesModule.getMisRole(id),
  getMisEmployee: (id: string) => rolesModule.getMisEmployee(id),
}));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
const putObject = vi.fn();
vi.mock('@/server/storage', () => ({
  putObject: (...a: unknown[]) => putObject(...a),
  getObject: async () => ({ bytes: new Uint8Array([1]), contentType: 'image/webp', contentLength: 1 }),
}));
vi.mock('@/server/mis/kiosk-device', () => ({ authenticateDevice: async () => ({ id: 'd1' }) }));

const employee = await import('./employee');
const photo = await import('./employee-photo');

const login = (id: string) => getCurrentUser.mockResolvedValue({ id });

beforeEach(() => {
  vi.clearAllMocks();
  seedPeople({ flat: true });
  for (const p of world.people) Object.assign(p, { wageTypeCode: 'WG-A', payType: 'DAILY', sundayPaid: false });
  login('u-adm');
});

describe('B33 wage fields are Owner-only on the server', () => {
  it('ADMIN posting a different wage code is forbidden, and nothing is written', async () => {
    await expect(employee.updateEmployee('w1', { wageTypeCode: 'HIGH' })).rejects.toThrow(/Not permitted: wages\.read/);
    expect(world.writes).toEqual([]);
  });

  it('ADMIN changing payType or sundayPaid is forbidden too', async () => {
    await expect(employee.updateEmployee('w1', { payType: 'MONTHLY' })).rejects.toThrow(/Not permitted: wages\.read/);
    await expect(employee.updateEmployee('w1', { sundayPaid: true })).rejects.toThrow(/Not permitted: wages\.read/);
  });

  it('ADMIN saving the name with an UNCHANGED wage code (the form re-posts it) is fine', async () => {
    await expect(
      employee.updateEmployee('w1', { name: 'Renamed', wageTypeCode: 'WG-A', payType: 'DAILY', sundayPaid: false }),
    ).resolves.toMatchObject({ name: 'Renamed' });
  });

  it('OWNER may change the wage code', async () => {
    login('u-own');
    await expect(employee.updateEmployee('w1', { wageTypeCode: 'HIGH' })).resolves.toMatchObject({ wageTypeCode: 'HIGH' });
  });

  it('ADMIN creating with sundayPaid:true or a wage code is forbidden; a plain create is fine', async () => {
    await expect(employee.createEmployee({ employeeCode: 'N1', name: 'N', sundayPaid: true })).rejects.toThrow(/wages\.read/);
    await expect(employee.createEmployee({ employeeCode: 'N2', name: 'N', wageTypeCode: 'HIGH' })).rejects.toThrow(/wages\.read/);
    await expect(employee.createEmployee({ employeeCode: 'N3', name: 'N', payType: 'DAILY', sundayPaid: false })).resolves.toBeDefined();
  });
});

describe('B34 the audit row names the pay code, never an amount', () => {
  it('an update that changes the code shows payCode before and after', async () => {
    login('u-own');
    await employee.updateEmployee('w1', { wageTypeCode: 'HIGH' });
    const call = audit.mock.calls.map((c) => c[0]).find((e) => e.action === 'employee.update');
    expect(call.before.payCode).toBe('WG-A');
    expect(call.after.payCode).toBe('HIGH');
    expect(JSON.stringify(call)).not.toMatch(/wage/i);
    expect(call.after).toMatchObject({ payType: 'DAILY', sundayPaid: false });
  });
});

describe('B35 an Owner record is Owner-only; no self-delete', () => {
  it.each([
    ['updateEmployee', () => employee.updateEmployee('e-own', { name: 'X' })],
    ['deleteEmployee', () => employee.deleteEmployee('e-own')],
    ['restoreEmployee', () => employee.restoreEmployee('e-own')],
  ])('ADMIN cannot %s on the Owner', async (_n, call) => {
    await expect(call()).rejects.toThrow(/Not permitted/);
  });

  it('the OWNER may update the Owner row', async () => {
    login('u-own');
    await expect(employee.updateEmployee('e-own', { name: 'Boss' })).resolves.toMatchObject({ name: 'Boss' });
  });

  it('nobody can delete their own record', async () => {
    login('u-own');
    await expect(employee.deleteEmployee('e-own')).rejects.toThrow('You cannot delete your own record');
    login('u-adm');
    await expect(employee.deleteEmployee('e-adm')).rejects.toThrow('You cannot delete your own record');
  });
});

describe('B36 IDOR: all five by-id functions apply the visibility pool', () => {
  beforeEach(() => {
    seedPeople(); // the real tree: supervisor A sees themselves + w1, w2, not w3 (supervisor B's)
    for (const p of world.people) Object.assign(p, { wageTypeCode: 'WG-A', payType: 'DAILY', sundayPaid: false, photoUrl: '/p' });
    login('u-supA');
  });

  it('getEmployee: out-of-pool is null (same as an unknown id); in-pool opens', async () => {
    expect(await employee.getEmployee('w3')).toBeNull();
    expect(await employee.getEmployee('does-not-exist')).toBeNull();
    expect((await employee.getEmployee('w1'))?.id).toBe('w1');
  });

  it('getEmployeePhoto: out-of-pool reads as no photo; in-pool returns the bytes', async () => {
    expect(await photo.getEmployeePhoto('w3')).toBeNull();
    expect(await photo.getEmployeePhoto('w1')).not.toBeNull();
  });

  it('OWNER sees all', async () => {
    login('u-own');
    expect((await employee.getEmployee('w3'))?.id).toBe('w3');
    expect(await photo.getEmployeePhoto('w3')).not.toBeNull();
  });

  it('an Admin (pool-scoped to their subtree) gets the not-found message on a person outside it', async () => {
    login('u-adm2'); // manages only the attendance operator
    await expect(employee.updateEmployee('w3', { name: 'X' })).rejects.toThrow('Employee w3 not found');
    await expect(employee.deleteEmployee('w3')).rejects.toThrow('Employee w3 not found');
    await expect(employee.restoreEmployee('w3')).rejects.toThrow('Employee w3 not found');
    await expect(employee.updateEmployee('does-not-exist', { name: 'X' })).rejects.toThrow('Employee does-not-exist not found');
  });
});

describe('B41 an Admin assigns only roles strictly below Admin', () => {
  it('ADMIN -> ADMIN (create and update) is forbidden; ADMIN -> SUPERVISOR is fine', async () => {
    await expect(employee.createEmployee({ employeeCode: 'A1', name: 'A', role: 'ADMIN' })).rejects.toThrow(/Not permitted/);
    await expect(employee.updateEmployee('w1', { role: 'ADMIN' })).rejects.toThrow(/Not permitted/);
    await expect(employee.updateEmployee('w1', { role: 'SUPERVISOR' })).resolves.toMatchObject({ role: 'SUPERVISOR' });
  });

  it('assignableRoles: Owner all eight, Admin the six below Admin, others none', () => {
    expect(assignableRoles('OWNER')).toHaveLength(8);
    expect(assignableRoles('ADMIN')).toEqual(['SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'STORE_GUY', 'WORKER']);
    expect(assignableRoles('QC')).toEqual([]);
  });
});
