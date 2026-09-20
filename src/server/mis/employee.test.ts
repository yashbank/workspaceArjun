import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misEmployee: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const mockWouldCreateManagerCycle = vi.fn();
vi.mock('@/server/mis/visibility', () => ({
  resolveVisibleEmployeeWhere: vi.fn().mockResolvedValue({}),
  wouldCreateManagerCycle: (...a: unknown[]) => mockWouldCreateManagerCycle(...a),
}));

const { updateEmployee } = await import('./employee');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  mockFindUnique.mockResolvedValue({ id: 'emp-1', role: 'WORKER', managerId: null });
});

describe('updateEmployee — manager assignment', () => {
  it('rejects a change that would create a cycle, before writing anything', async () => {
    mockWouldCreateManagerCycle.mockResolvedValue(true);

    await expect(updateEmployee('emp-1', { managerId: 'emp-2' })).rejects.toThrow(
      /cannot be their own manager/i,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('applies a legal manager change', async () => {
    mockWouldCreateManagerCycle.mockResolvedValue(false);
    mockUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'emp-1',
      ...data,
    }));

    const after = await updateEmployee('emp-1', { managerId: 'emp-2' });

    expect(after.managerId).toBe('emp-2');
  });

  it('clearing a manager (null) never checks for a cycle — clearing cannot create one', async () => {
    mockUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'emp-1',
      ...data,
    }));

    await updateEmployee('emp-1', { managerId: null });

    expect(mockWouldCreateManagerCycle).not.toHaveBeenCalled();
  });

  it('leaving managerId untouched (undefined) neither checks nor writes the column', async () => {
    mockUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'emp-1',
      ...data,
    }));

    const after = await updateEmployee('emp-1', { name: 'New Name' });

    expect(mockWouldCreateManagerCycle).not.toHaveBeenCalled();
    expect('managerId' in (mockUpdate.mock.calls[0][0] as { data: object }).data).toBe(false);
    expect(after.name).toBe('New Name');
  });
});
