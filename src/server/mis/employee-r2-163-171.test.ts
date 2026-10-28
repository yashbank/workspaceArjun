/**
 * R2-163 default shift on the employee, R2-171 Active / Inactive toggle that is not a delete.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const findUnique = vi.fn();
const update = vi.fn();
const create = vi.fn();
const shiftFindFirst = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misEmployee: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a), create: (...a: unknown[]) => create(...a) },
    misShift: { findFirst: (...a: unknown[]) => shiftFindFirst(...a) },
  },
}));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/mis/visibility', () => ({
  resolveVisibleEmployeeWhere: vi.fn().mockResolvedValue({}),
  wouldCreateManagerCycle: vi.fn().mockResolvedValue(false),
}));

const { createEmployee, updateEmployee, setEmployeeActive } = await import('./employee');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
  findUnique.mockResolvedValue({ id: 'emp-1', role: 'WORKER', isActive: true, deletedAt: null, userProfileId: null, defaultShiftId: null });
  update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'emp-1', ...data }));
  create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'emp-new', ...data }));
});

describe('R2-163 default shift', () => {
  it('create persists defaultShiftId for an active shift', async () => {
    shiftFindFirst.mockResolvedValue({ id: 'sh1' });
    await createEmployee({ employeeCode: 'b1', name: 'A', defaultShiftId: 'sh1' });
    expect((create.mock.calls[0][0] as { data: { defaultShiftId: string } }).data.defaultShiftId).toBe('sh1');
  });

  it('update sets and clears it; an unknown or inactive shift is refused before any write', async () => {
    shiftFindFirst.mockResolvedValue({ id: 'sh1' });
    await updateEmployee('emp-1', { defaultShiftId: 'sh1' });
    expect((update.mock.calls[0][0] as { data: { defaultShiftId: string } }).data.defaultShiftId).toBe('sh1');
    update.mockClear();
    findUnique.mockResolvedValue({ id: 'emp-1', role: 'WORKER', defaultShiftId: 'sh1' });
    await updateEmployee('emp-1', { defaultShiftId: null });
    expect((update.mock.calls[0][0] as { data: { defaultShiftId: null } }).data.defaultShiftId).toBeNull();
    update.mockClear();
    shiftFindFirst.mockResolvedValue(null);
    await expect(updateEmployee('emp-1', { defaultShiftId: 'gone' })).rejects.toThrow('Shift not found or not active');
    expect(update).not.toHaveBeenCalled();
  });

  it('leaving it undefined does not touch the column', async () => {
    await updateEmployee('emp-1', { name: 'New' });
    expect('defaultShiftId' in (update.mock.calls[0][0] as { data: object }).data).toBe(false);
  });
});

describe('R2-171 setEmployeeActive', () => {
  it('flips isActive only - never deletedAt - and audits it', async () => {
    await setEmployeeActive('emp-1', false);
    expect(update.mock.calls[0][0]).toMatchObject({ where: { id: 'emp-1' }, data: { isActive: false } });
    expect('deletedAt' in (update.mock.calls[0][0] as { data: object }).data).toBe(false);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'employee.deactivate' }));
  });

  it('activates again, audited as activate', async () => {
    findUnique.mockResolvedValue({ id: 'emp-1', role: 'WORKER', isActive: false, deletedAt: null, userProfileId: null });
    await setEmployeeActive('emp-1', true);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'employee.activate' }));
  });

  it('refuses a deleted employee, your own record, and a role without employees.write', async () => {
    findUnique.mockResolvedValue({ id: 'emp-1', role: 'WORKER', isActive: true, deletedAt: new Date(), userProfileId: null });
    await expect(setEmployeeActive('emp-1', false)).rejects.toThrow(/Restore/);
    findUnique.mockResolvedValue({ id: 'emp-1', role: 'WORKER', isActive: true, deletedAt: null, userProfileId: 'u1' });
    await expect(setEmployeeActive('emp-1', false)).rejects.toThrow('your own');
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(setEmployeeActive('emp-1', false)).rejects.toThrow(/Not permitted/);
    expect(update).not.toHaveBeenCalled();
  });
});
