import type { Prisma } from '@/generated/prisma/client';
import { NOTIFICATION_TYPES } from '@/lib/mis/notification-copy';
import { db } from '@/server/db';

import { notifyRoles } from './notifications';

/**
 * Store-flow notices (R2-67, R2-80). Writers, not readers: each is called by a gated, audited mutation AFTER its own
 * write, is best-effort (an inbox row that cannot be written must never undo the movement it reports), and writes to
 * the same durable `notifications` table the bell reads.
 */

/** R2-80: Owner + Admin are told when stock leaves (or is asked for) as General / factory use. */
export async function notifyGeneralUse(
  actorId: string,
  g: { isGeneral: boolean; costCenter: string | null; generalReason: string | null },
  payload: { reference: string; kind: 'issue' | 'request'; requestId?: string | null },
): Promise<void> {
  if (!g.isGeneral) return;
  await notifyRoles(['OWNER', 'ADMIN'], NOTIFICATION_TYPES.generalUse, { ...payload, costCenter: g.costCenter, reason: g.generalReason }, actorId);
}

/** R2-67: the Supervisor who raised a request hears when the Store decides it. One row, for that login only. */
export async function notifyRequestDecided(
  requesterId: string | null | undefined,
  payload: { requestId: string; requestNumber: string; decision: 'APPROVED' | 'REJECTED'; note?: string | null; pickList?: boolean },
): Promise<void> {
  if (!requesterId) return;
  try {
    await db.notification.create({ data: { userId: requesterId, type: NOTIFICATION_TYPES.requestDecided, payload: payload as Prisma.InputJsonValue } });
  } catch (error) {
    console.error('[mis-notify] failed to write the request decision notice', { error });
  }
}
