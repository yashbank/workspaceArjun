/**
 * Phase 14 · MIS-49 — cross-role visibility, at the LISTS that compose the resolver.
 *
 * `visibility.test.ts` already proves the resolver on mocked queries. This proves the lists
 * that use it (`listEmployees`, `getCrewSummary`, `getWorkerAvailability`) actually narrow, for
 * every role, on a REAL tree — because with no `managerId` links the resolver returns unscoped
 * and "supervisor cannot see X" would pass for the wrong reason (Phase 2 stamp). Each case
 * first proves the tree is live (the flat-org control at the bottom is the counter-example).
 *
 * D4: a user sees their own subtree; an Admin does not see other Admins or the Owner.
 * D5: ONLY people narrow — attendance, machines and orders do not, and a test says so.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MisRoleName } from '@/lib/mis/roles';

import { importsOf } from './testing/ast';
import { fakePeopleDb, rolesModule, seedPeople, world } from './testing/people-world';

vi.mock('@/server/db', () => ({ db: fakePeopleDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/server/mis/roles', () => ({
  getMisRole: (id: string) => rolesModule.getMisRole(id),
  getMisEmployee: (id: string) => rolesModule.getMisEmployee(id),
}));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const { listEmployees, getEmployee } = await import('./employee');
const { getCrewSummary, getWorkerAvailability } = await import('./worker-allocation');
const { resolveVisibleEmployeeIds } = await import('./visibility');

const login = (id: string) => getCurrentUser.mockResolvedValue({ id });
const names = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

beforeEach(() => {
  vi.clearAllMocks();
  seedPeople();
});

describe('D4 — listEmployees returns exactly the caller\'s subtree', () => {
  const EVERYONE_LIVE = ['e-adm', 'e-adm2', 'e-att', 'e-orphan', 'e-own', 'e-qc', 'e-supA', 'e-supB', 'w1', 'w2', 'w3'];

  it('OWNER sees everyone on the roll — including the orphan no chain reaches', async () => {
    login('u-own');
    expect(names(await listEmployees())).toEqual(EVERYONE_LIVE);
  });

  it('ADMIN sees self + supervisors + QC + workers below — NOT the other Admin, the Owner, or the orphan', async () => {
    login('u-adm');
    expect(names(await listEmployees())).toEqual(['e-adm', 'e-qc', 'e-supA', 'e-supB', 'w1', 'w2', 'w3']);
  });

  it("the other ADMIN sees only their own branch — the first Admin's people are invisible", async () => {
    login('u-adm2');
    expect(names(await listEmployees())).toEqual(['e-adm2', 'e-att']);
  });

  it('SUPERVISOR A sees own crew only — not Supervisor B\'s worker, not the Admin above', async () => {
    login('u-supA');
    expect(names(await listEmployees())).toEqual(['e-supA', 'w1', 'w2']);
  });

  it('SUPERVISOR B sees only their one worker', async () => {
    login('u-supB');
    expect(names(await listEmployees())).toEqual(['e-supB', 'w3']);
  });

  it('a leaf ATTENDANCE_OPERATOR sees only themselves — an empty pool, not the whole factory', async () => {
    login('u-att');
    expect(names(await listEmployees())).toEqual(['e-att']);
  });

  it('a soft-deleted worker is in nobody\'s pool', async () => {
    login('u-supA');
    expect(names(await listEmployees())).not.toContain('w4');
    login('u-own');
    expect(names(await listEmployees())).not.toContain('w4');
  });

  it('a login with a role but NO employee record sees nobody (`[]`), not everybody (`null`)', async () => {
    login('u-ghost'); // resolves to no MisEmployee → getMisRole returns null → forbidden, so drive the resolver directly
    expect(await resolveVisibleEmployeeIds({ userId: 'u-ghost', role: 'ADMIN' })).toEqual([]);
    expect(await resolveVisibleEmployeeIds({ userId: 'u-own', role: 'OWNER' })).toBeNull();
  });

  it('the narrowing happens IN THE QUERY, not after it — the database is never asked for rows the caller may not see', async () => {
    login('u-supA');
    await listEmployees();
    const listQuery = world.queries.at(-1)!.where;
    expect(listQuery.id.in.sort()).toEqual(['e-supA', 'w1', 'w2']);
  });

  it('roles without employees.read cannot list at all — narrowing is not the first line of defence', async () => {
    for (const [user, role] of [['u-qc', 'QC']] as [string, MisRoleName][]) {
      login(user);
      await expect(listEmployees(), role).rejects.toThrow(/Not permitted: employees\.read/);
    }
  });
});

describe('D4 — the people lists on the supervisor home (crew and availability)', () => {
  const today = new Date('2026-09-20T00:00:00Z');

  it.each([
    ['u-own', 'OWNER', 5], // w1 w2 w3 e-qc e-orphan — the WORKER/QC pool of the whole factory
    ['u-adm', 'ADMIN', 4], // w1 w2 w3 e-qc
    ['u-supA', 'SUPERVISOR', 2], // w1 w2
    ['u-supB', 'SUPERVISOR', 1], // w3
  ] as const)('getCrewSummary for %s (%s) counts %i people', async (user, _role, headcount) => {
    login(user);
    expect((await getCrewSummary(today)).headcount).toBe(headcount);
  });

  it('getWorkerAvailability lists exactly the same pool, by id', async () => {
    login('u-supA');
    expect((await getWorkerAvailability('shift-1', today)).map((r) => r.employeeId).sort()).toEqual(['w1', 'w2']);
    login('u-supB');
    expect((await getWorkerAvailability('shift-1', today)).map((r) => r.employeeId)).toEqual(['w3']);
  });

  it('a Supervisor never receives another Supervisor\'s worker in the picker (the leak the tree exists to stop)', async () => {
    login('u-supA');
    const ids = (await getWorkerAvailability('shift-1', today)).map((r) => r.employeeId);
    expect(ids).not.toContain('w3');
    expect(ids).not.toContain('e-orphan');
  });
});

describe('the control — with NO org chart entered, nothing narrows (so the tests above are not vacuous)', () => {
  it('a flat roll returns everyone to a supervisor: that is the "unscoped" answer the Phase 2 stamp warns about', async () => {
    seedPeople({ flat: true });
    login('u-supA');
    expect(names(await listEmployees()).length).toBe(11);
  });

  it('and the tree fixture really has links, so the narrowing tests above assert something', () => {
    seedPeople();
    expect(world.people.filter((p) => p.managerId !== null).length).toBeGreaterThanOrEqual(8);
  });
});

describe('D5 — ONLY people narrow by pool', () => {
  it.each(['attendance.ts', 'machines-board.ts', 'machine.ts', 'orders.ts', 'production.ts', 'qc.ts', 'reports.ts'])(
    '%s does not compose the people scope (attendance, machines and orders are plant-wide)',
    (file) => {
      const imports = importsOf(`src/server/mis/${file}`).filter((i) => i.from === './visibility' || i.from === '@/server/mis/visibility');
      expect(imports).toEqual([]);
    },
  );

  it('the only consumers of the resolver are the two people lists', () => {
    const consumers = ['employee.ts', 'worker-allocation.ts'].filter((f) =>
      importsOf(`src/server/mis/${f}`).some((i) => i.from.endsWith('/visibility') || i.from === './visibility'),
    );
    expect(consumers).toEqual(['employee.ts', 'worker-allocation.ts']);
  });
});

describe('F-11 — the pool is enforced on the LIST but not on a lookup by id', () => {
  // D4: "a user sees their own subtree only … not other Admins and not the Owner", applied "in
  // the Prisma query". getEmployee(id) has no scope: any employees.read holder can open any
  // row — and the payslip print page is built on it.
  it.fails('F-11: SUPERVISOR A cannot open an employee outside their pool by id', async () => {
    login('u-supA');
    const row = await getEmployee('w3');
    expect(row).toBeNull();
  });

  it.fails('F-11: an ADMIN cannot open the Owner\'s record by id', async () => {
    login('u-adm');
    expect(await getEmployee('e-own')).toBeNull();
  });

  it('control: a supervisor CAN open someone in their own pool (so the two refusals above are about scope, not a broken fixture)', async () => {
    login('u-supA');
    expect((await getEmployee('w1'))?.id).toBe('w1');
  });
});
