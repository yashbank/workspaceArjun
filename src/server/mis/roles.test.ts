/**
 * Phase 14 · MIS-34 — role resolution and migration safety.
 *
 * Resolution: a login's MIS role comes from ONE place — its own live `MisEmployee` row — and
 * every way that row can be absent, deleted or switched off resolves to `null`, which the
 * permission matrix treats as "nothing allowed". The workspace's own roles play no part.
 *
 * Migration safety: the role vocabulary is written in four places (lib, Prisma schema, the
 * generated client, the SQL migrations). If they drift, a role the code knows is one the
 * database refuses, or the reverse. This pins all four together, and pins the safe DEFAULT
 * (WORKER — the role with no permissions) so a migration can never hand out access.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MisRole as GeneratedMisRole } from '@/generated/prisma/enums';
import { can } from '@/lib/mis/permissions';
import { MIS_ROLES } from '@/lib/mis/roles';

import { listFiles, readSource } from './testing/ast';

const findUnique = vi.fn();
const userProfileTouched = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misEmployee: { findUnique: (...a: unknown[]) => findUnique(...a) },
    userProfile: new Proxy({}, { get: () => userProfileTouched }),
  },
}));

const { getMisRole, hasMisRole, getMisEmployee } = await import('./roles');

const live = (role: string, over: Record<string, unknown> = {}) => ({ role, deletedAt: null, isActive: true, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(null);
});

describe('getMisRole — one answer per login', () => {
  it.each(MIS_ROLES)('resolves %s from its live employee row', async (role) => {
    findUnique.mockResolvedValue(live(role));
    expect(await getMisRole(`user-${role}`)).toBe(role);
  });

  it('null when the login has no employee record — the normal answer for a worker, not an error', async () => {
    expect(await getMisRole('user-x')).toBeNull();
  });

  it('null when the employee is soft-deleted, even though the row still says ADMIN', async () => {
    findUnique.mockResolvedValue(live('ADMIN', { deletedAt: new Date() }));
    expect(await getMisRole('user-del')).toBeNull();
  });

  it('null when the employee is switched off (isActive = false), even though the row still says OWNER', async () => {
    findUnique.mockResolvedValue(live('OWNER', { isActive: false }));
    expect(await getMisRole('user-off')).toBeNull();
  });

  it('null — and NO database call — for an empty login id', async () => {
    expect(await getMisRole('')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('asks for the row by login id and reads only role, deletedAt and isActive (least data)', async () => {
    findUnique.mockResolvedValue(live('QC'));
    await getMisRole('user-q');
    expect(findUnique).toHaveBeenCalledWith({
      where: { userProfileId: 'user-q' },
      select: { role: true, deletedAt: true, isActive: true },
    });
  });

  it('never consults the workspace user table — a workspace owner is NOT an MIS owner', async () => {
    findUnique.mockResolvedValue(null);
    expect(await getMisRole('first-ever-user')).toBeNull();
    expect(userProfileTouched).not.toHaveBeenCalled();
  });

  it('a null role is allowed nothing by the matrix — every action, all of them', async () => {
    const role = await getMisRole('nobody');
    for (const action of ['masters.read', 'attendance.write', 'wages.read', 'users.invite'] as const) {
      expect(can(role, action)).toBe(false);
    }
  });
});

describe('hasMisRole / getMisEmployee', () => {
  it('true only for a listed role; false for another; false for no role', async () => {
    findUnique.mockResolvedValue(live('SUPERVISOR'));
    expect(await hasMisRole('u', ['SUPERVISOR', 'QC'])).toBe(true);
    expect(await hasMisRole('u', ['OWNER'])).toBe(false);
    findUnique.mockResolvedValue(null);
    expect(await hasMisRole('u2', ['OWNER', 'ADMIN'])).toBe(false);
  });

  it('getMisEmployee is null for an empty id without touching the database', async () => {
    expect(await getMisEmployee('')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('migration safety — the role vocabulary is the same in all four places', () => {
  const schema = readSource('prisma/schema.prisma');
  const enumBlock = schema.slice(schema.indexOf('enum MisRole {'), schema.indexOf('}', schema.indexOf('enum MisRole {')));
  const schemaRoles = enumBlock.split('\n').map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));

  const migrations = listFiles('prisma/migrations', /^migration\.sql$/).map((f) => readSource(f)).join('\n');
  const created = /CREATE TYPE "MisRole" AS ENUM \(([^)]*)\)/.exec(migrations)?.[1].match(/'([A-Z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
  const added = [...migrations.matchAll(/ALTER TYPE "MisRole" ADD VALUE(?: IF NOT EXISTS)? '([A-Z_]+)'/g)].map((m) => m[1]);
  const migrated = [...created, ...added];

  it('the lib list, the Prisma schema, the generated client and the migrations agree exactly', () => {
    const lib = [...MIS_ROLES].sort();
    expect(schemaRoles.sort()).toEqual(lib);
    expect(Object.values(GeneratedMisRole).sort()).toEqual(lib);
    expect(migrated.sort()).toEqual(lib);
  });

  it('the migration history really was read (a moved folder would pass the equality above with two empty lists)', () => {
    expect(created.length).toBeGreaterThanOrEqual(7);
    expect(added).toContain('STORE_GUY');
  });

  it('a new employee defaults to WORKER — the role with no permissions — in the schema AND in the SQL', () => {
    expect(schema).toMatch(/role\s+MisRole\s+@default\(WORKER\)/);
    expect(migrations).toMatch(/"role" "MisRole" NOT NULL DEFAULT 'WORKER'/);
    expect(MIS_ROLES.filter((r) => !can(r, 'masters.read') && !can(r, 'employees.read') && !can(r, 'attendance.read'))).toContain('WORKER');
  });

  it('no migration inserts an employee, and none sets a role to OWNER or ADMIN — a migration never grants access', () => {
    expect(migrations).not.toMatch(/INSERT INTO "?mis_employees"?/i);
    expect(migrations).not.toMatch(/UPDATE "?mis_employees"?[\s\S]{0,80}SET[\s\S]{0,40}role/i);
  });

  it('the MIS role is its own type — MisEmployee.role is MisRole, not the workspace UserRole', () => {
    const start = schema.indexOf('model MisEmployee {');
    const block = schema.slice(start, schema.indexOf('\n}', start));
    expect(block).toMatch(/role\s+MisRole/);
    expect(block).not.toMatch(/role\s+UserRole/);
  });

  it('an enum value can only ever be ADDED by a migration, never dropped (a dropped value would strand a live row)', () => {
    expect(migrations).not.toMatch(/ALTER TYPE "MisRole" (DROP|RENAME)/);
  });
});
