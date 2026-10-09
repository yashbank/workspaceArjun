import type { Prisma } from '@/generated/prisma/client';
import { isMisNotifyRole, type MisNotifyRole } from '@/lib/mis/notification-copy';
import { db } from '@/server/db';

import { requirePermission } from './auth';

/**
 * V2 — live in-app notifications for OWNER, ADMIN and STORE_GUY only.
 *
 * Same durable `notifications` table and Supabase Realtime channel the Owner's security alerts
 * already use (no second system, no new dependency). Every other role is served an empty list
 * and never subscribes, so the rest of the platform is untouched. Writers call `notifyRoles`
 * best-effort after their own gated, audited mutation.
 */

export type MisNotificationRow = { id: string; type: string; payload: unknown; createdAt: Date };

/** One row per active login holding one of `roles`. Never throws: an alert must not undo the write it reports. */
export async function notifyRoles(roles: readonly MisNotifyRole[], type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const recipients = await db.userProfile.findMany({
      where: { status: 'active', misEmployee: { role: { in: [...roles] }, isActive: true, deletedAt: null } },
      select: { id: true },
    });
    if (recipients.length === 0) return;
    await db.notification.createMany({
      data: recipients.map((r) => ({ userId: r.id, type, payload: payload as Prisma.InputJsonValue })),
    });
  } catch (error) {
    console.error('[mis-notify] failed to write notification rows', { type, error });
  }
}

/** One row for one login (the person who raised a request), only if their role is on the bell. */
export async function notifyUser(userId: string, type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const profile = await db.userProfile.findUnique({ where: { id: userId }, select: { status: true, misEmployee: { select: { role: true } } } });
    if (profile?.status !== 'active' || !isMisNotifyRole(profile.misEmployee?.role)) return;
    await db.notification.create({ data: { userId, type, payload: payload as Prisma.InputJsonValue } });
  } catch (error) {
    console.error('[mis-notify] failed to write a notification row', { type, error });
  }
}

/** The caller's unread MIS notifications, newest first. Empty for a role the bell is not for. */
export async function listMisNotifications(limit = 20): Promise<MisNotificationRow[]> {
  const actor = await requirePermission('grn.read');
  if (!isMisNotifyRole(actor.role)) return [];
  const rows = await db.notification.findMany({
    where: { userId: actor.userId, type: { startsWith: 'mis.' }, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((n) => ({ id: n.id, type: n.type, payload: n.payload, createdAt: n.createdAt }));
}

/** Marks the caller's own rows read. Another user's ids are silently ignored by the `userId` filter. */
export async function markMisNotificationsRead(ids: string[]): Promise<void> {
  const actor = await requirePermission('grn.read');
  if (ids.length === 0) return;
  await db.notification.updateMany({ where: { id: { in: ids }, userId: actor.userId, type: { startsWith: 'mis.' } }, data: { readAt: new Date() } });
}
