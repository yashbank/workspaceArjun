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
  | 'settings.change';

interface AuditLogInput {
  actor?: UserProfile | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function logAuditEvent(input: AuditLogInput) {
  await db.auditEvent.create({
    data: {
      actorId: input.actor?.id ?? null,
      role: input.actor?.role ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
