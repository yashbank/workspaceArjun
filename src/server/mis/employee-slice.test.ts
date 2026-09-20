/**
 * Phase 14 · MIS-43 — the reference slice, end to end at the server-function level:
 * create → list → update → soft-delete → restore, each with its audit row and its gate.
 *
 * Employees are the module every later slice copies, so the shape is pinned here: codes are
 * normalised, a new person defaults to the least-privileged role, deletion is soft and
 * reversible, every write is audited with the actor, and the model holds no money.
 * (The ticket's title is cut off in the inventory — "…the reference-slice write…"; whatever
 * write-up it meant is documentation and is not tested here.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readSource } from './testing/ast';
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

const employee = await import('./employee');

const login = (id: string) => getCurrentUser.mockResolvedValue({ id });

beforeEach(() => {
  vi.clearAllMocks();
  seedPeople({ flat: true }); // flat: this file is about the write path, not scope (see visibility-lists.test.ts)
  login('u-adm');
});

describe('create', () => {
  it('normalises the code to UPPER CASE, trims the name, and defaults the role to WORKER — the role with no permissions', async () => {
    const row = await employee.createEmployee({ employeeCode: '  emp-77 ', name: '  Ravi  ' });
    expect(row.employeeCode).toBe('EMP-77');
    expect(row.name).toBe('Ravi');
    expect(row.role).toBe('WORKER');
  });

  it('writes one audit row naming the acting login and the new row', async () => {
    const row = await employee.createEmployee({ employeeCode: 'E-1', name: 'A' });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({ actorId: 'u-adm', action: 'employee.create', entity: 'MisEmployee', entityId: row.id });
  });

  it('a blank Hindi name is stored as null, not as an empty string', async () => {
    expect((await employee.createEmployee({ employeeCode: 'E-2', name: 'B', nameHi: '   ' })).nameHi).toBeNull();
  });
});

describe('list, update, delete, restore', () => {
  it('a soft-deleted person disappears from the list and returns on restore — nothing is destroyed', async () => {
    const before = (await employee.listEmployees()).length;
    await employee.deleteEmployee('w1');
    expect((await employee.listEmployees()).map((r) => r.id)).not.toContain('w1');
    expect((await employee.listEmployees(true)).map((r) => r.id)).toContain('w1');
    expect(world.people.find((p) => p.id === 'w1')).toMatchObject({ isActive: false });
    expect(world.people.find((p) => p.id === 'w1')!.deletedAt).toBeInstanceOf(Date);

    await employee.restoreEmployee('w1');
    expect((await employee.listEmployees()).length).toBe(before);
    expect(world.people.find((p) => p.id === 'w1')).toMatchObject({ isActive: true, deletedAt: null });
  });

  it('update changes only the fields in the patch', async () => {
    const before = { ...world.people.find((p) => p.id === 'w2')! };
    await employee.updateEmployee('w2', { name: '  New Name ' });
    const after = world.people.find((p) => p.id === 'w2')!;
    expect(after.name).toBe('New Name');
    expect({ ...after, name: before.name }).toEqual(before);
  });

  it('update of a missing person is an error, not a silent no-op', async () => {
    await expect(employee.updateEmployee('nope', { name: 'x' })).rejects.toThrow(/not found/);
    expect(world.writes).toEqual([]);
  });

  it('every mutation is audited with the actor, and update/delete carry before and after', async () => {
    await employee.updateEmployee('w2', { name: 'Z' });
    await employee.deleteEmployee('w2');
    await employee.restoreEmployee('w2');
    expect(audit.mock.calls.map((c) => c[0].action)).toEqual(['employee.update', 'employee.delete', 'employee.restore']);
    expect(audit.mock.calls.every((c) => c[0].actorId === 'u-adm')).toBe(true);
    expect(audit.mock.calls[0][0].before.name).toBe('Name w2');
    expect(audit.mock.calls[0][0].after.name).toBe('Z');
  });

  it('a refused caller changes nothing and audits nothing', async () => {
    login('u-supA'); // employees.read but not employees.write
    await expect(employee.createEmployee({ employeeCode: 'X', name: 'X' })).rejects.toThrow(/Not permitted: employees\.write/);
    await expect(employee.deleteEmployee('w1')).rejects.toThrow(/Not permitted/);
    expect(world.writes).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('the employee model holds no money — so no employee function can return a wage', () => {
  it('MisEmployee has no wage, salary, rate, pay or ctc column', () => {
    const schema = readSource('prisma/schema.prisma');
    const start = schema.indexOf('model MisEmployee {');
    const block = schema.slice(start, schema.indexOf('\n}', start));
    const columns = block.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => /^[a-z]/.test(c));
    expect(columns.length).toBeGreaterThan(10); // the block was found and parsed
    expect(columns.filter((c) => /wage|salary|rate|pay|ctc|amount|price|cost/i.test(c))).toEqual([]);
  });

  it('every Mis* column that looks like money is on the reviewed list (a new one needs an owner-only decision)', () => {
    const schema = readSource('prisma/schema.prisma');
    const found: string[] = [];
    for (const m of schema.matchAll(/^model (Mis\w+) \{([\s\S]*?)^\}/gm)) {
      for (const line of m[2].split('\n')) {
        const [col, type] = line.trim().split(/\s+/);
        if (!col || !/^[a-z]/.test(col) || !type || col.startsWith('//')) continue;
        if (/wage|salary|amount|price|cost|rate(?!d)|gross|ctc/i.test(col) && /Decimal|Float|Int/.test(type)) found.push(`${m[1]}.${col}`);
      }
    }
    expect(found.sort()).toEqual(['MisBomMaterial.ratePerUnit', 'MisItem.pricePerUnit', 'MisPoItem.ratePerUnit', 'MisWageType.amount']);
  });
});

describe('F-10 (fixed in 14F, D25) — only an Owner may grant the Owner role', () => {
  // employees.write is held by ADMIN, and the role rides in the same patch. roles.ts resolves a
  // login's role from this very row, so writing OWNER onto it is granting wages.read, aql.read
  // and users.invite. The rule now lives in the server functions; the picker only mirrors it.
  it('control: an Admin may still give someone a lower role', async () => {
    await expect(employee.updateEmployee('w1', { role: 'SUPERVISOR' })).resolves.toBeDefined();
    await expect(employee.createEmployee({ employeeCode: 'N1', name: 'N', role: 'STORE_GUY' })).resolves.toBeDefined();
  });

  it('an Admin cannot promote an existing person to OWNER — and nothing is written or audited', async () => {
    await expect(employee.updateEmployee('w1', { role: 'OWNER' })).rejects.toThrow(/Not permitted: users\.invite/);
    expect(world.writes).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
    expect(world.people.find((p) => p.id === 'w1')!.role).toBe('WORKER');
  });

  it('an Admin cannot promote THEMSELVES to OWNER, and still does not resolve as OWNER afterwards', async () => {
    await expect(employee.updateEmployee('e-adm', { role: 'OWNER' })).rejects.toThrow(/Not permitted/);
    expect(await rolesModule.getMisRole('u-adm')).toBe('ADMIN');
  });

  it('an Admin cannot create a new person with the OWNER role', async () => {
    await expect(employee.createEmployee({ employeeCode: 'BOSS', name: 'B', role: 'OWNER' })).rejects.toThrow(/Not permitted/);
    expect(world.writes).toEqual([]);
  });

  it('a role that is not a role at all is refused, not passed to the database', async () => {
    await expect(employee.updateEmployee('w1', { role: 'SUPERUSER' as never })).rejects.toThrow(/Unknown role/);
    await expect(employee.createEmployee({ employeeCode: 'X9', name: 'X', role: 'owner' as never })).rejects.toThrow(/Unknown role/);
    expect(world.writes).toEqual([]);
  });

  it('an empty role field means "leave the role alone" — a form that sends "" neither errors nor changes it', async () => {
    await employee.updateEmployee('w1', { name: 'Same', role: '' as never });
    expect(world.people.find((p) => p.id === 'w1')).toMatchObject({ name: 'Same', role: 'WORKER' });
  });

  it("an Admin can still rename the Owner's row when the form resends the role unchanged — restating a role grants nothing", async () => {
    await expect(employee.updateEmployee('e-own', { name: 'Renamed', role: 'OWNER' })).resolves.toMatchObject({ name: 'Renamed', role: 'OWNER' });
  });

  it('but a form that also renames someone whose role is NOT already OWNER cannot smuggle OWNER in with the rename', async () => {
    await expect(employee.updateEmployee('w1', { name: 'Also', role: 'OWNER' })).rejects.toThrow(/Not permitted/);
  });

  it('the Owner may (so the refusals are about WHO asks, not about the role)', async () => {
    login('u-own');
    await expect(employee.updateEmployee('w1', { role: 'OWNER' })).resolves.toBeDefined();
    await expect(employee.createEmployee({ employeeCode: 'CO', name: 'Co', role: 'OWNER' })).resolves.toBeDefined();
  });

  // The seven non-Owner roles, at the SERVER FUNCTION — not the picker. Six are refused by
  // employees.write; ADMIN passes that gate and is refused by the role rule. Every one is refused.
  describe.each(['ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER', 'STORE_GUY'] as const)('%s', (role) => {
    beforeEach(() => {
      vi.spyOn(rolesModule, 'getMisRole').mockResolvedValue(role);
    });

    it('createEmployee(role: OWNER) is refused and writes nothing', async () => {
      await expect(employee.createEmployee({ employeeCode: 'ZZ', name: 'Z', role: 'OWNER' })).rejects.toThrow(/Not permitted/);
      expect(world.writes).toEqual([]);
      expect(audit).not.toHaveBeenCalled();
    });

    it('updateEmployee(role: OWNER) is refused — on someone else, and on their own row', async () => {
      await expect(employee.updateEmployee('w1', { role: 'OWNER' })).rejects.toThrow(/Not permitted/);
      await expect(employee.updateEmployee('e-adm', { role: 'OWNER' })).rejects.toThrow(/Not permitted/);
      expect(world.writes).toEqual([]);
      expect(audit).not.toHaveBeenCalled();
    });
  });
});
