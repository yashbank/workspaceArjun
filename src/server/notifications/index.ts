import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

export type NotificationType = 'security.access_denied';

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
