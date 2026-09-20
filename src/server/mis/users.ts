import { db } from '@/server/db';
import { getSeatUsage } from '@/server/users';
import { inviteUser as inviteWorkspaceUser } from '@/server/admin';

import type { MisRoleName } from '@/lib/mis/roles';

import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

/**
 * MIS user management — MIS-11/E1-08.
 *
 * BR-001 (see `R1-Owner.png`): the MIS adds no second login of its own. Every
 * person here is a workspace `UserProfile`; this module only ever attaches a
 * `MisEmployee` row (and a `MisRole`) to one. The actual invite email, the
 * seat-limit check and the pending-invite bookkeeping are the workspace's own,
 * already-audited pipeline in `@/server/admin` and `@/server/users` — reused
 * whole here, not re-implemented.
 */

export type MisUserRow = {
  id: string;
  employeeCode: string;
  name: string;
  role: MisRoleName;
  isActive: boolean;
  email: string | null;
  accountStatus: string | null;
};

/** Everyone who can sign in to the MIS today. Owner and Admin may both view. */
export async function listMisUsers(): Promise<MisUserRow[]> {
  await requirePermission('employees.read');
  const rows = await db.misEmployee.findMany({
    where: { deletedAt: null, userProfileId: { not: null } },
    include: { userProfile: { select: { email: true, status: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    employeeCode: r.employeeCode,
    name: r.name,
    role: r.role as MisRoleName,
    isActive: r.isActive,
    email: r.userProfile?.email ?? null,
    accountStatus: r.userProfile?.status ?? null,
  }));
}

export type MisSeatSummary = {
  /** The one shared 15-seat pool — the whole workspace, not a MIS-only count. */
  max: number;
  used: number;
  available: number;
  /** Of the seats in use, how many are MIS logins. Context, not a second limit. */
  misUserCount: number;
};

export async function getMisSeatSummary(): Promise<MisSeatSummary> {
  await requirePermission('employees.read');
  const [seats, misUserCount] = await Promise.all([
    getSeatUsage(),
    db.misEmployee.count({ where: { deletedAt: null, userProfileId: { not: null } } }),
  ]);
  return { max: seats.max, used: seats.used, available: seats.available, misUserCount };
}

/** `EMP-A1B2C3`-shaped, never reused: enough to be unique without meaning anything. */
function candidateEmployeeCode(email: string): string {
  const local = email.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'USER';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EMP-${local.slice(0, 8)}-${suffix}`;
}

async function uniqueEmployeeCode(email: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = candidateEmployeeCode(email);
    const clash = await db.misEmployee.findUnique({ where: { employeeCode: code } });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique employee code');
}

async function linkOrCreateMisEmployee(userProfileId: string, role: MisRoleName, actorId: string) {
  const existing = await db.misEmployee.findUnique({ where: { userProfileId } });

  if (existing) {
    const after = await db.misEmployee.update({
      where: { id: existing.id },
      data: { role, deletedAt: null, isActive: true },
    });
    await logAuditEvent({
      actorId,
      action: 'mis.user.grant',
      entity: 'MisEmployee',
      entityId: after.id,
      before: { role: existing.role },
      after: { role: after.role },
    });
    return after;
  }

  const profile = await db.userProfile.findUniqueOrThrow({ where: { id: userProfileId } });
  const created = await db.misEmployee.create({
    data: {
      userProfileId,
      employeeCode: await uniqueEmployeeCode(profile.email),
      name: profile.name || profile.email,
      role,
    },
  });
  await logAuditEvent({
    actorId,
    action: 'mis.user.grant',
    entity: 'MisEmployee',
    entityId: created.id,
    after: { role },
  });
  return created;
}

export type InviteMisUserResult =
  | { kind: 'linked'; employeeId: string }
  | { kind: 'invited' };

/**
 * Owner only (MIS-11's acceptance rule; ADMIN may only view via
 * `listMisUsers`). Two real, complete outcomes:
 *
 * - The email already belongs to a workspace user → the MIS role is granted
 *   immediately (find-or-create the `MisEmployee`, link it). No seat is
 *   spent — they already hold one.
 * - The email is new → the real workspace invite goes out through the
 *   existing, audited, seat-checked pipeline (`@/server/admin`'s
 *   `inviteUser`), which already provides the seat-limit guard this ticket
 *   asks for and the "re-inviting an existing email does not create a second
 *   user" guarantee. The base role is always `'member'`: a MIS invite must
 *   never grant base-app admin/owner rights over the file-management side
 *   as a side effect of choosing a MisRole.
 *
 * A known, documented limitation of the second path: nothing in the
 * workspace's invite/accept flow carries a MisRole through to acceptance
 * (there is no MIS invite table to stash it in, by BR-001's own design — see
 * the module comment). The Owner returns to this screen and grants the role
 * once the new person has accepted and appears in `listMisUsers`'s sibling
 * (a plain workspace user, not yet a `MisEmployee`) — see `phase-reports/phase-03.md`
 * for the follow-up this implies.
 */
export async function inviteMisUser(email: string, role: MisRoleName): Promise<InviteMisUserResult> {
  const actor = await requirePermission('users.invite');
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('Email is required');

  const existingProfile = await db.userProfile.findFirst({ where: { email: normalized } });
  if (existingProfile) {
    const linked = await linkOrCreateMisEmployee(existingProfile.id, role, actor.userId);
    return { kind: 'linked', employeeId: linked.id };
  }

  await inviteWorkspaceUser(normalized, 'member');

  await logAuditEvent({
    actorId: actor.userId,
    action: 'mis.user.invite',
    entity: 'UserInvite',
    entityId: normalized,
    after: { email: normalized, intendedMisRole: role },
  });

  return { kind: 'invited' };
}

export type PendingMisGrant = { userProfileId: string; email: string; name: string | null };

/**
 * Workspace users with no MisEmployee yet — the people this screen's Owner
 * still needs to grant a role to, most often because they just accepted an
 * invite MIS-50 sent. Owner only, same surface as inviteMisUser.
 */
export async function listPendingMisGrants(): Promise<PendingMisGrant[]> {
  await requirePermission('users.invite');
  const rows = await db.userProfile.findMany({
    where: { status: 'active', misEmployee: { is: null } },
    select: { id: true, email: true, name: true },
    orderBy: { email: 'asc' },
  });
  return rows.map((r) => ({ userProfileId: r.id, email: r.email, name: r.name }));
}

/** Grant a MIS role to a workspace user who does not have one yet. Owner only. */
export async function grantMisRole(userProfileId: string, role: MisRoleName): Promise<void> {
  const actor = await requirePermission('users.invite');
  await linkOrCreateMisEmployee(userProfileId, role, actor.userId);
}
