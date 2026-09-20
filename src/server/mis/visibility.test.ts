import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MisRoleName } from '@/lib/mis/roles';

const getMisEmployee = vi.fn();
vi.mock('@/server/mis/roles', () => ({
  getMisEmployee: (...a: unknown[]) => getMisEmployee(...a),
}));

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misEmployee: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a),
    },
  },
}));

const {
  resolveVisibleEmployeeIds,
  resolveVisibleEmployeeWhere,
  resolveVisibleAttendanceWhere,
  resolveVisibleMachineWhere,
  resolveVisibleOrderWhere,
  wouldCreateManagerCycle,
} = await import('./visibility');

type Actor = { userId: string; role: MisRoleName };
const actor = (role: MisRoleName, userId = 'u-actor'): Actor => ({ userId, role });

/** An org chart exists, so the scope is live. */
function hierarchyPopulated() {
  mockFindFirst.mockResolvedValue({ id: 'some-link' });
}

/**
 * Feed the breadth-first descent one level at a time. Each array is the rows
 * returned for that level; the descent stops when a level comes back empty.
 */
function levels(...byLevel: string[][]) {
  let call = 0;
  mockFindMany.mockImplementation(() => {
    const level = byLevel[call] ?? [];
    call += 1;
    return Promise.resolve(level.map((id) => ({ id })));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hierarchyPopulated();
  levels();
  getMisEmployee.mockResolvedValue({ id: 'e-actor' });
});

describe('the owner', () => {
  it('is unscoped rather than scoped to an empty pool', async () => {
    const ids = await resolveVisibleEmployeeIds(actor('OWNER', 'u-owner'));
    expect(ids).toBeNull();
  });

  it('composes an empty where fragment, which narrows nothing', async () => {
    expect(await resolveVisibleEmployeeWhere(actor('OWNER', 'u-owner'))).toEqual({});
  });
});

describe('a user with people under them', () => {
  it('sees themselves and everyone below', async () => {
    levels(['e-a', 'e-b'], ['e-c']);
    const ids = await resolveVisibleEmployeeIds(actor('ADMIN', 'u-admin'));
    expect(ids).toContain('e-actor');
    expect(ids).toEqual(expect.arrayContaining(['e-a', 'e-b', 'e-c']));
  });

  it('walks more than one level down', async () => {
    levels(['e-sup'], ['e-worker']);
    const ids = await resolveVisibleEmployeeIds(actor('ADMIN', 'u-admin'));
    expect(ids).toEqual(expect.arrayContaining(['e-sup', 'e-worker']));
  });

  it('costs one query per level, not one per person', async () => {
    levels(['e-1', 'e-2', 'e-3'], ['e-4', 'e-5']);
    await resolveVisibleEmployeeIds(actor('SUPERVISOR', 'u-sup-n1'));
    // 3 calls: two populated levels, then the empty one that ends the walk.
    expect(mockFindMany).toHaveBeenCalledTimes(3);
  });
});

describe('a user with nobody under them', () => {
  it('sees only themselves — an empty pool, not the whole factory', async () => {
    const ids = await resolveVisibleEmployeeIds(actor('QC', 'u-qc'));
    expect(ids).toEqual(['e-actor']);
    expect(ids).not.toBeNull();
  });
});

describe('a login with no employee record', () => {
  it('sees nobody rather than everybody', async () => {
    getMisEmployee.mockResolvedValue(null);
    const ids = await resolveVisibleEmployeeIds(actor('SUPERVISOR', 'u-ghost'));
    expect(ids).toEqual([]);
  });

  it('composes a fragment that can never match a row', async () => {
    getMisEmployee.mockResolvedValue(null);
    const where = await resolveVisibleEmployeeWhere(actor('SUPERVISOR', 'u-ghost2'));
    expect(where).toEqual({ id: { in: [] } });
  });
});

describe('before any org chart is entered', () => {
  it('narrows nothing, so lists that work today keep working', async () => {
    mockFindFirst.mockResolvedValue(null);
    const ids = await resolveVisibleEmployeeIds(actor('SUPERVISOR', 'u-sup-nolinks'));
    expect(ids).toBeNull();
  });
});

describe('bad data', () => {
  it('terminates on a managerId cycle instead of hanging', async () => {
    // Every level hands back a row already seen — a loop in the data.
    mockFindMany.mockResolvedValue([{ id: 'e-loop' }]);
    const ids = await resolveVisibleEmployeeIds(actor('ADMIN', 'u-cycle'));
    expect(ids).toEqual(['e-actor', 'e-loop']);
  });
});

describe('attendance', () => {
  it('scopes through the people scope', async () => {
    levels(['e-x']);
    const where = await resolveVisibleAttendanceWhere(actor('SUPERVISOR', 'u-att'));
    expect(where).toEqual({ employeeId: { in: ['e-actor', 'e-x'] } });
  });

  it('narrows nothing for an unscoped actor', async () => {
    expect(await resolveVisibleAttendanceWhere(actor('OWNER', 'u-owner-att'))).toEqual({});
  });
});

describe('wouldCreateManagerCycle', () => {
  it('rejects a person managing themselves', async () => {
    expect(await wouldCreateManagerCycle('e-self', 'e-self')).toBe(true);
  });

  it('rejects assigning a descendant as the manager', async () => {
    levels(['e-report']);
    expect(await wouldCreateManagerCycle('e-boss', 'e-report')).toBe(true);
  });

  it('allows assigning someone who is not a descendant', async () => {
    levels(['e-report']);
    expect(await wouldCreateManagerCycle('e-boss', 'e-unrelated')).toBe(false);
  });
});

describe('machines and orders', () => {
  it('are not narrowed for any role, pending a decision', async () => {
    const roles: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC', 'STORE_GUY'];
    for (const role of roles) {
      expect(await resolveVisibleMachineWhere(actor(role, `u-m-${role}`))).toEqual({});
      expect(await resolveVisibleOrderWhere(actor(role, `u-o-${role}`))).toEqual({});
    }
  });
});
