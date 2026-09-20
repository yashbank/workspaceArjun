import { newIdempotencyKey, type QueuedWriteEnvelope } from '@/lib/mis/offline/idempotency';
import { type OfflineQueue, type QueuedItem } from '@/lib/mis/offline/queue';
import type { PunchPayload } from '@/server/mis/attendance-punch';

/**
 * K2's Fix, for the one failure a tablet can put right: an unrecognised badge.
 *
 * "Fix does not edit the punch. It records a correction that supersedes it" — so this
 * NEVER changes the held entry. It records a NEW punch, under a NEW key, for the
 * person the operator says it really was, at the ORIGINAL scan time (D15: 06:47 is
 * 06:47, however long it took to sort out), and names the held entry it corrects so
 * the server can mark that one resolved. Only then is the local copy of the held
 * entry dropped — the server already holds it, durably, with its payload (§B.7).
 *
 * Order matters: the correction is saved BEFORE the old entry is dropped, so a
 * failure part-way loses nothing.
 *
 * Nothing else is fixable here. A closed day, a wrong clock or a leaver needs a
 * person with authority (D21); the kiosk says who, and offers no button.
 */
export async function fixUnknownBadge(
  item: QueuedItem,
  person: { employeeCode: string; name: string },
  queue: OfflineQueue,
  newKey: () => string = newIdempotencyKey,
): Promise<{ ok: true; key: string } | { ok: false; detail: string }> {
  if (item.status !== 'PARKED' || item.reason !== 'BADGE_UNKNOWN') {
    return { ok: false, detail: 'Only an unrecognised badge can be fixed here.' };
  }
  if (item.kind !== 'attendance.punch_in' && item.kind !== 'attendance.punch_out') {
    return { ok: false, detail: 'That is not a punch.' };
  }

  const original = (item.payload ?? {}) as PunchPayload;
  const envelope: QueuedWriteEnvelope<PunchPayload> = {
    key: newKey(),
    kind: item.kind,
    // Same operator and shift hint as the scan; a different person; and the pointer back.
    payload: { ...original, badgeCode: person.employeeCode, correctsKey: item.key },
    clientRecordedAt: item.clientRecordedAt,
    deviceId: item.deviceId,
    queuedBy: item.queuedBy,
  };

  try {
    await queue.enqueue(envelope, `${person.name} · ${item.kind === 'attendance.punch_in' ? 'in' : 'out'}`);
  } catch (error) {
    return { ok: false, detail: `Could not save the correction${error instanceof Error ? ` (${error.message})` : ''}. The held punch is untouched.` };
  }
  await queue.discard(item.key);
  void queue.replay();
  return { ok: true, key: envelope.key };
}
