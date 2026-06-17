import { db } from '@/server/db';
import type { UserProfile } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';

type AuditAction =
  | 'login.success'
  | 'login.failure'
  | 'logout'
  | 'password.reset'
  | 'mfa.enroll'
  | 'user.profile_created'
  | 'user.invite'
  | 'user.invite_resend'
  | 'user.invite_cancel'
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.reactivate'
  | 'user.remove'
  | 'user.ownership_transfer'
  | 'user.access_mode_change'
  | 'user.access_code_generate'
  | 'file.upload'
  | 'file.download'
  | 'file.rename'
  | 'file.move'
  | 'file.delete'
  | 'file.restore'
  | 'file.permanent_delete'
  | 'folder.create'
  | 'folder.rename'
  | 'folder.move'
  | 'folder.delete'
  | 'folder.restore'
  | 'folder.permanent_delete'
  | 'version.upload'
  | 'version.restore'
  | 'version.purge'
  | 'settings.change'
  // Access control (office IP / device restriction) — defined for later phases;
  // not logged yet.
  | 'access.denied'
  | 'device.request'
  | 'device.approve'
  | 'device.revoke';

interface AuditLogInput {
  actor?: UserProfile | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

function toAuditRow(input: AuditLogInput) {
  return {
    actorId: input.actor?.id ?? null,
    role: input.actor?.role ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  };
}

export async function logAuditEvent(input: AuditLogInput) {
  await db.auditEvent.create({ data: toAuditRow(input) });
}

/**
 * Writes many audit events in a single `createMany` insert. Each input maps to
 * exactly the same row a `logAuditEvent` call would produce — use this for bulk
 * operations to avoid N sequential inserts. No-op on an empty array.
 */
export async function logAuditEvents(inputs: AuditLogInput[]) {
  if (inputs.length === 0) return;
  await db.auditEvent.createMany({ data: inputs.map(toAuditRow) });
}
