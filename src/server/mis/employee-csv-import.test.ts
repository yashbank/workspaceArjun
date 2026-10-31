/**
 * Bulk employee CSV import — every row goes through `createEmployee` itself (the same
 * `employees.write` gate, the same `assertMayAssignRole` door, the same audit trail), so this
 * test is about the BATCH behaviour: a bad row never aborts the rows around it, and the result
 * says exactly what happened to each row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const mockCreate = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misEmployee: {
      create: (...a: unknown[]) => mockCreate(...a),
    },
    misDepartment: {
      findFirst: async () => null,
    },
  },
}));

const mockAudit = vi.fn();
vi.mock('./audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

vi.mock('./visibility', () => ({
  resolveVisibleEmployeeWhere: vi.fn().mockResolvedValue({}),
  wouldCreateManagerCycle: vi.fn().mockResolvedValue(false),
}));

const { importEmployeesCsv } = await import('./employee');

let nextId = 1;

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 1;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `emp-${nextId++}`,
    ...data,
  }));
});

describe('importEmployeesCsv', () => {
  it('happy path: creates every valid row', async () => {
    const rows = [
      { employeeCode: 'w001', name: 'Asha Devi' },
      { employeeCode: 'w002', name: 'Ravi Kumar', phone: '9876543210' },
      { employeeCode: 'w003', name: 'Meena', nameHi: 'मीना', role: 'SUPERVISOR' },
    ];

    const result = await importEmployeesCsv(rows);

    expect(result).toEqual({ created: 3, errors: [] });
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({ employeeCode: 'W001', name: 'Asha Devi' });
    expect(mockAudit).toHaveBeenCalledTimes(3);
  });

  it('a row with an unknown role is reported as an error; the valid rows around it still import', async () => {
    const rows = [
      { employeeCode: 'w010', name: 'Good One' },
      { employeeCode: 'w011', name: 'Bad Role', role: 'MANAGER' },
      { employeeCode: 'w012', name: 'Another Good' },
    ];

    const result = await importEmployeesCsv(rows);

    expect(result.created).toBe(2);
    expect(result.errors).toEqual([{ row: 2, message: 'Unknown role: MANAGER' }]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('a non-Owner/Admin caller is refused before anything is read or written', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');

    await expect(importEmployeesCsv([{ employeeCode: 'w020', name: 'Someone' }])).rejects.toThrow(/Not permitted/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a duplicate employee code within the same batch is reported as an error, not a crash', async () => {
    const rows = [
      { employeeCode: 'w030', name: 'First' },
      { employeeCode: 'W030', name: 'Duplicate of the first (different case)' },
      { employeeCode: 'w031', name: 'Unrelated' },
    ];

    const result = await importEmployeesCsv(rows);

    expect(result.created).toBe(2);
    expect(result.errors).toEqual([{ row: 2, message: 'Duplicate employee code "W030" in this file.' }]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('a missing required field is a per-row error, not a crash', async () => {
    const rows = [{ employeeCode: '', name: 'No code' }, { employeeCode: 'w040', name: '' }];

    const result = await importEmployeesCsv(rows);

    expect(result.created).toBe(0);
    expect(result.errors).toEqual([
      { row: 1, message: 'Employee code is required.' },
      { row: 2, message: 'Name is required.' },
    ]);
  });

  it('refuses the whole batch above the row cap, before writing anything', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ employeeCode: `w${i}`, name: `Person ${i}` }));

    await expect(importEmployeesCsv(rows)).rejects.toThrow(/Too many rows/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
