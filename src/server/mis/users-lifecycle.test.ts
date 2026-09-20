/**
 * Phase 14 · MIS-52 — the invite lifecycle and the seat limit, end to end.
 *
 * Two real outcomes (Phase 3 stamp) and both are walked:
 *   (a) the email already has a workspace login → the MIS role is granted at once, no seat is
 *       spent, no invite goes out;
 *   (b) the email is new → a real workspace invite goes out through the reused, seat-checked
 *       pipeline at base role `member`, and the person later lands in the pending-grants list
 *       until the Owner grants a role.
 * The SEAT LIMIT lives in the reused pipeline (`@/server/users/seats`), not in users.ts, so a
 * lifecycle test that only walks (a) proves nothing about it — this one drives the real guard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const world = { profiles: [] as Row[], employees: [] as Row[], pendingInvites: 0, maxSeats: 15, inviteCalls: [] as [string, string][] };

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/settings', () => ({ getMaxUsers: async () => world.maxSeats }));

vi.mock('@/server/db', () => ({
  db: {
    userProfile: {
      findFirst: async ({ where }: Row) => world.profiles.find((p) => p.email === where.email) ?? null,
      findUniqueOrThrow: async ({ where }: Row) => world.profiles.find((p) => p.id === where.id)!,
      findMany: async () =>
        world.profiles.filter((p) => p.status === 'active' && !world.employees.some((e) => e.userProfileId === p.id)),
      count: async ({ where }: Row) => world.profiles.filter((p) => p.status === where.status).length,
    },
    userInvite: { count: async () => world.pendingInvites },
    misEmployee: {
      // A snapshot, like Prisma: a live reference would make every audit `before` equal its `after`.
      findUnique: async ({ where }: Row) => {
        const row = world.employees.find((e) => (where.userProfileId ? e.userProfileId === where.userProfileId : e.employeeCode === where.employeeCode));
        return row ? { ...row } : null;
      },
      create: async ({ data }: Row) => {
        const row = { id: `emp-${world.employees.length + 1}`, deletedAt: null, isActive: true, ...data };
        world.employees.push(row);
        return { ...row };
      },
      update: async ({ where, data }: Row) => {
        const row = world.employees.find((e) => e.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
      findMany: async () =>
        world.employees
          .filter((e) => !e.deletedAt && e.userProfileId)
          .map((e) => ({ ...e, userProfile: world.profiles.find((p) => p.id === e.userProfileId) ?? null })),
      count: async () => world.employees.filter((e) => !e.deletedAt && e.userProfileId).length,
    },
  },
}));

// The reused workspace pipeline. Its own seat guard is the REAL one.
vi.mock('@/server/users', async () => {
  const seats = await vi.importActual<typeof import('@/server/users/seats')>('@/server/users/seats');
  return { getSeatUsage: seats.getSeatUsage, assertSeatAvailable: seats.assertSeatAvailable };
});
vi.mock('@/server/admin', async () => {
  const seats = await vi.importActual<typeof import('@/server/users/seats')>('@/server/users/seats');
  return {
    inviteUser: async (email: string, role: string) => {
      await seats.assertSeatAvailable(); // the same call, in the same place, as admin/index.ts
      world.inviteCalls.push([email, role]);
      world.pendingInvites += 1;
    },
  };
});

const { assertSeatAvailable, getSeatUsage } = await import('@/server/users/seats');
const { inviteMisUser, listPendingMisGrants, grantMisRole, getMisSeatSummary, listMisUsers } = await import('./users');

const activeProfiles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, email: `p${i}@example.com`, name: `P${i}`, status: 'active' }));

beforeEach(() => {
  vi.clearAllMocks();
  world.profiles = activeProfiles(3);
  world.employees = [];
  world.pendingInvites = 0;
  world.maxSeats = 15;
  world.inviteCalls = [];
  getCurrentUser.mockResolvedValue({ id: 'owner-1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('the seat limit (the real guard)', () => {
  it('used = active users + pending invites; available never goes below zero', async () => {
    world.profiles = activeProfiles(14);
    world.pendingInvites = 3;
    expect(await getSeatUsage()).toEqual({ max: 15, active: 14, pendingInvites: 3, used: 17, available: 0 });
  });

  it.each([
    [13, 0, true],
    [14, 0, true], // 14 of 15: one seat left
    [15, 0, false], // full
    [14, 1, false], // 14 active + 1 pending = full — a pending invite holds a seat
    [0, 0, true],
  ])('%i active + %i pending → an invite is %s', async (active, pending, allowed) => {
    world.profiles = activeProfiles(active);
    world.pendingInvites = pending;
    if (allowed) await expect(assertSeatAvailable()).resolves.toBeDefined();
    else await expect(assertSeatAvailable()).rejects.toThrow(/user limit reached \(15 seats\)/);
  });

  it('a deactivated user does not hold a seat', async () => {
    world.profiles = [...activeProfiles(14), { id: 'gone', email: 'gone@example.com', status: 'inactive' }];
    await expect(assertSeatAvailable()).resolves.toBeDefined();
  });

  it('the summary the Owner sees matches the guard, and separates MIS logins as context, not a second limit', async () => {
    world.profiles = activeProfiles(10);
    world.pendingInvites = 2;
    world.employees = [{ id: 'e1', userProfileId: 'p1', deletedAt: null }];
    expect(await getMisSeatSummary()).toEqual({ max: 15, used: 12, available: 3, misUserCount: 1 });
  });
});

describe('path (b) — a new email: the workspace invite pipeline', () => {
  it('sends the invite at base role "member" — even when the Owner asked for OWNER — and audits the INTENDED role', async () => {
    expect(await inviteMisUser('  New.Person@Example.COM ', 'OWNER')).toEqual({ kind: 'invited' });
    expect(world.inviteCalls).toEqual([['new.person@example.com', 'member']]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'mis.user.invite', after: { email: 'new.person@example.com', intendedMisRole: 'OWNER' } }));
  });

  it('no seat left → the invite is refused, NOTHING is audited and NO employee is created', async () => {
    world.profiles = activeProfiles(15);
    await expect(inviteMisUser('new@example.com', 'QC')).rejects.toThrow(/user limit reached/);
    expect(world.inviteCalls).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
    expect(world.employees).toEqual([]);
  });

  it('a pending invite holds the last seat: inviting a second person while the first is still pending is refused', async () => {
    world.profiles = activeProfiles(14);
    await expect(inviteMisUser('first@example.com', 'QC')).resolves.toEqual({ kind: 'invited' });
    await expect(inviteMisUser('second@example.com', 'QC')).rejects.toThrow(/user limit reached/);
  });

  it('an empty email is refused before any lookup', async () => {
    await expect(inviteMisUser('   ', 'QC')).rejects.toThrow('Email is required');
    expect(world.inviteCalls).toEqual([]);
  });
});

describe('path (a) — an email that already has a workspace login', () => {
  it('links immediately, spends no seat, sends no invite — and works even when every seat is taken', async () => {
    world.profiles = activeProfiles(15);
    const result = await inviteMisUser('p3@example.com', 'SUPERVISOR');
    expect(result).toEqual({ kind: 'linked', employeeId: expect.any(String) });
    expect(world.inviteCalls).toEqual([]);
    expect(world.employees[0]).toMatchObject({ userProfileId: 'p3', role: 'SUPERVISOR', isActive: true });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'mis.user.grant', entity: 'MisEmployee' }));
  });
});

describe('the whole lifecycle, in order', () => {
  it('invite → accept → pending grant → grant → resolved role → removed → re-invited (revived, new role)', async () => {
    // 1. Invite a stranger.
    await inviteMisUser('ravi@example.com', 'QC');
    expect(world.inviteCalls).toEqual([['ravi@example.com', 'member']]);
    expect(world.pendingInvites).toBe(1);

    // 2. They accept: a workspace profile now exists, the invite is no longer pending. No MIS role yet.
    world.pendingInvites = 0;
    world.profiles.push({ id: 'ravi', email: 'ravi@example.com', name: 'Ravi', status: 'active' });
    expect((await listPendingMisGrants()).map((g) => g.email)).toContain('ravi@example.com');
    expect(world.employees).toEqual([]); // accepting an invite grants NO role (BR-001)

    // 3. The Owner grants the role.
    await grantMisRole('ravi', 'QC');
    expect(world.employees).toHaveLength(1);
    expect(world.employees[0]).toMatchObject({ userProfileId: 'ravi', role: 'QC' });
    expect((await listPendingMisGrants()).map((g) => g.email)).not.toContain('ravi@example.com');
    expect((await listMisUsers()).map((u) => u.email)).toEqual(['ravi@example.com']);

    // 4. They leave (soft delete), then are invited again with a different role: the same row is revived.
    Object.assign(world.employees[0], { deletedAt: new Date(), isActive: false });
    await inviteMisUser('ravi@example.com', 'SUPERVISOR');
    expect(world.employees).toHaveLength(1);
    expect(world.employees[0]).toMatchObject({ role: 'SUPERVISOR', isActive: true, deletedAt: null });
    const revive = audit.mock.calls.map((c) => c[0]).filter((e) => e.action === 'mis.user.grant').at(-1);
    expect(revive).toMatchObject({ before: { role: 'QC' }, after: { role: 'SUPERVISOR' } });
  });

  it('every audit row in the lifecycle carries the acting Owner and no wage or amount', async () => {
    await inviteMisUser('a@example.com', 'QC');
    world.profiles.push({ id: 'pa', email: 'b@example.com', name: 'B', status: 'active' });
    await grantMisRole('pa', 'STORE_GUY');
    const entries = audit.mock.calls.map((c) => c[0]);
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.actorId === 'owner-1')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/wage|salary|amount|rate/i);
  });
});

describe('only the Owner runs any of it', () => {
  it.each(['ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER', 'STORE_GUY'])(
    '%s cannot invite, list pending grants or grant — and nothing is written',
    async (role) => {
      getMisRole.mockResolvedValue(role);
      await expect(inviteMisUser('x@example.com', 'QC')).rejects.toThrow(/Not permitted: users\.invite/);
      await expect(listPendingMisGrants()).rejects.toThrow(/Not permitted: users\.invite/);
      await expect(grantMisRole('p1', 'OWNER')).rejects.toThrow(/Not permitted: users\.invite/);
      expect(world.inviteCalls).toEqual([]);
      expect(world.employees).toEqual([]);
      expect(audit).not.toHaveBeenCalled();
    },
  );
});
