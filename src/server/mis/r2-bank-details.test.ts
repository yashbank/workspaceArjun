/**
 * R2-110 bank fields on the employee: validated on write, employees.write (Owner, Admin) only,
 * stripped from every read for other roles, and masked in the audit row.
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
const BANK = { bankName: 'SBI', bankAccountNo: '123456789012', ifsc: 'SBIN0001234' };

beforeEach(() => {
  vi.clearAllMocks();
  seedPeople({ flat: true });
  for (const p of world.people) Object.assign(p, { wageTypeCode: null, payType: 'DAILY', sundayPaid: false });
  login('u-adm');
});

describe('bank details write', () => {
  it('ADMIN saves a valid, normalised block', async () => {
    const out = await employee.updateEmployee('w1', { bankName: ' SBI ', bankAccountNo: '1234 5678 9012', ifsc: 'sbin0001234' });
    expect(out).toMatchObject(BANK);
  });
  it('a malformed IFSC or account is refused and nothing is written', async () => {
    await expect(employee.updateEmployee('w1', { ...BANK, ifsc: 'BAD' })).rejects.toThrow(/IFSC/);
    await expect(employee.updateEmployee('w1', { ...BANK, bankAccountNo: '12' })).rejects.toThrow(/9 to 18 digits/);
    expect(world.writes).toEqual([]);
  });
  it('patching only the IFSC on an employee with no account is refused (merged check)', async () => {
    await expect(employee.updateEmployee('w1', { ifsc: 'SBIN0001234' })).rejects.toThrow(/Account number is required/);
  });
  it('create stores the bank block', async () => {
    await expect(employee.createEmployee({ employeeCode: 'B1', name: 'B', ...BANK })).resolves.toMatchObject(BANK);
  });
  it('roles without employees.write cannot write at all', async () => {
    for (const u of ['u-supA', 'u-qc', 'u-att']) {
      login(u);
      await expect(employee.updateEmployee('w1', BANK)).rejects.toThrow(/Not permitted/);
      await expect(employee.createEmployee({ employeeCode: 'B2', name: 'B', ...BANK })).rejects.toThrow(/Not permitted/);
    }
    expect(world.writes).toEqual([]);
  });
});

describe('bank details read', () => {
  beforeEach(() => {
    for (const p of world.people) Object.assign(p, BANK);
  });
  it('Owner and Admin see them in lists and by id', async () => {
    for (const u of ['u-own', 'u-adm']) {
      login(u);
      expect((await employee.listEmployees())[0]).toMatchObject(BANK);
      expect((await employee.listEmployeeRoster())[0]).toMatchObject(BANK);
      expect(await employee.getEmployee('w1')).toMatchObject(BANK);
    }
  });
  it('QC cannot read the employee list at all', async () => {
    login('u-qc');
    await expect(employee.listEmployees()).rejects.toThrow(/Not permitted/);
  });
  it('Supervisor and Attendance Operator never receive the keys', async () => {
    for (const u of ['u-supA', 'u-att']) {
      login(u);
      const list = await employee.listEmployees();
      expect(list.length).toBeGreaterThan(0);
      for (const r of [...list, ...(await employee.listEmployeeRoster())]) {
        expect(r).not.toHaveProperty('bankAccountNo');
        expect(r).not.toHaveProperty('ifsc');
        expect(r).not.toHaveProperty('bankName');
      }
      const one = await employee.getEmployee('w1');
      expect(one).not.toHaveProperty('bankAccountNo');
    }
  });
});

describe('bank details audit', () => {
  it('the account number is masked, never stored in full', async () => {
    await employee.updateEmployee('w1', BANK);
    const call = audit.mock.calls.map((c) => c[0]).find((c) => c.action === 'employee.update');
    expect(JSON.stringify(call)).not.toContain('123456789012');
    expect(call.after.bankAccountNo).toBe('••••9012');
  });
});
