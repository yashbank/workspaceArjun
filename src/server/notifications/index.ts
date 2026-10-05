import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * `mis.phase_ready` is written by `src/server/mis/job-phases.ts` inside the
 * sign-off transaction, so it cannot fire on a rollback. MIS-163 asked for the
 * existing table rather than a second notification system — note that
 * `listSecurityNotifications` filters on the `security.` prefix, so MIS rows
 * never reach the Owner's security modal.
 *
 * `mis.qc_defect` is the same pattern, written by `src/server/mis/qc.ts` (MIS-174/191,
 * "immediate notification" on a logged defect). Like `mis.phase_ready`, nothing yet reads it
 * back through a UI — the notification inbox itself is a separate, already-logged gap (F-29,
 * "a full feature build, not a polish fix") — so this is the same half-built-but-honest shape
 * already accepted for phase handovers, not a new kind of gap.
 */
export type NotificationType = 'security.access_denied' | 'mis.phase_ready' | 'mis.qc_defect';

/** Details carried by a phase-ready notification (the next section's in-charge). */
export type PhaseReadyPayload = {
  orderId: string;
  orderNumber: string;
  phaseId: string;
  processName: string;
  previousProcessName: string;
  signedOffAt: string;
};

/** Details carried by a QC-defect notification (a FAIL check or a rejected AQL sample). */
export type QcDefectPayload = {
  orderId: string;
  orderNumber: string;
  parameterName: string;
  defectType: string | null;
  checkTime: string;
};

/** Details carried by a security alert notification (rendered in the Owner modal). */
export type SecurityAlertPayload = {
  actorId: string;
  actorName: string | null;
  actorEmail: string;
  actorRole: string;
  ip: string | null;
  mode: string;
  deviceStatus: string;
  userAgent: string | null;
  enforced: boolean;
  at: string;
};

export type NotificationDTO = {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

/**
 * Fans a notification out to every active Owner. Used for security alerts so
 * the Owner is informed even if they were away when it happened (the row is
 * durable; Realtime just pushes it live). Best-effort by the caller — wrap in
 * try/catch so it never breaks the originating request.
 */
export async function notifyOwners(
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  const owners = await db.userProfile.findMany({
    where: { role: 'owner', status: 'active' },
    select: { id: true },
  });
  if (owners.length === 0) return;
  await db.notification.createMany({
    data: owners.map((o) => ({
      userId: o.id,
      type,
      payload: payload as Prisma.InputJsonValue,
    })),
  });
}

/**
 * Fans a QC defect out to every active SUPERVISOR with a login (MIS-174/191). Supervisors are
 * the role whose home already carries the "Quality hold" blocker card (`supervisor-home.tsx`)
 * and who can act on the floor right now — unlike `notifyOwners`, this is not an Owner-only
 * alert. A SUPERVISOR with no login (most are not required to have one) gets no row, same as
 * `job-phases.ts`'s next-in-charge notification; best-effort by the caller, wrap in try/catch.
 */
export async function notifySupervisorsOfQcDefect(payload: QcDefectPayload): Promise<void> {
  const supervisors = await db.userProfile.findMany({
    where: { misEmployee: { role: 'SUPERVISOR', isActive: true, deletedAt: null } },
    select: { id: true },
  });
  if (supervisors.length === 0) return;
  await db.notification.createMany({
    data: supervisors.map((s) => ({
      userId: s.id,
      type: 'mis.qc_defect' satisfies NotificationType,
      payload: payload as Prisma.InputJsonValue,
    })),
  });
}

/** A user's most recent security notifications, newest first. */
export async function listSecurityNotifications(
  userId: string,
  limit = 20,
): Promise<NotificationDTO[]> {
  const rows = await db.notification.findMany({
    where: { userId, type: { startsWith: 'security.' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    payload: n.payload,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Marks the given notifications read — scoped to the owner so no cross-user writes. */
export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.notification.updateMany({
    where: { id: { in: ids }, userId },
    data: { readAt: new Date() },
  });
}
