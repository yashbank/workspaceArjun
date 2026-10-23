/** R2-91 — the employee `phone` field is persisted on create and update. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/visibility', () => ({
  resolveVisibleEmployeeWhere: vi.fn().mockResolvedValue({}),
  wouldCreateManagerCycle: vi.fn().mockResolvedValue(false),
}));

type Args = { data: Record<string, unknown> };
const create = vi.fn(({ data }: Args) => ({ id: 'emp-1', ...data }));
const update = vi.fn(({ data }: Args) => ({ id: 'emp-1', role: 'WORKER', managerId: null, ...data }));
const findUnique = vi.fn(async (_a?: unknown) => ({ id: 'emp-1', role: 'WORKER', managerId: null, phone: null }));
vi.mock('@/server/db', () => ({ db: { misEmployee: { create: (a: Args) => create(a), update: (a: Args) => update(a), findUnique: (a: unknown) => findUnique(a) } } }));

const { createEmployee, updateEmployee } = await import('./employee');

beforeEach(() => {
  create.mockClear();
  update.mockClear();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('employee phone (R2-91)', () => {
  it('createEmployee trims and persists phone', async () => {
    const out = await createEmployee({ employeeCode: 'E1', name: 'Ram', phone: ' 98765-43210 ' });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ phone: '98765-43210' });
    expect(out.phone).toBe('98765-43210');
  });

  it('createEmployee without a phone leaves it null', async () => {
    await createEmployee({ employeeCode: 'E1', name: 'Ram' });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ phone: null });
  });

  it('updateEmployee patches phone, trimmed', async () => {
    const out = await updateEmployee('emp-1', { phone: ' 99999-00000 ' });
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ phone: '99999-00000' });
    expect(out.phone).toBe('99999-00000');
  });

  it('updateEmployee without phone in the patch leaves it untouched', async () => {
    await updateEmployee('emp-1', { name: 'Ram' });
    expect(update.mock.calls[0]?.[0].data).not.toHaveProperty('phone');
  });

  it('updateEmployee can clear phone with an empty string', async () => {
    const out = await updateEmployee('emp-1', { phone: '' });
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ phone: null });
    expect(out.phone).toBeNull();
  });
});
