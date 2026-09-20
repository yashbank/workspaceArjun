import { submitPunchLiveAction } from '@/app/(mis)/mis/kiosk/actions';
import { getDeviceId } from '@/lib/mis/offline/device';
import { newIdempotencyKey, type ParkReason, type QueuedWriteEnvelope } from '@/lib/mis/offline/idempotency';
import { getOfflineQueue, type OfflineQueue } from '@/lib/mis/offline/queue';
import { LIVE_TIMEOUT_MS, withTimeout } from '@/components/mis/production/submit-production';
import type { PunchPayload, PunchResult } from '@/server/mis/attendance-punch';

/**
 * What happened to a punch, in the terms the kiosk needs (K2).
 *
 *  - `APPLIED` — it landed, or had already landed.
 *  - `QUEUED`  — saved on this tablet; it will send when signal returns. The person
 *    walks on: "Saved on this tablet, sent automatically" — never "connection error".
 *  - `BLOCKED` — the server refused it live. Nothing was recorded anywhere.
 *  - `NOT_SAVED` — no signal AND nowhere to keep it. The one outcome that must never
 *    be hidden: the punch exists nowhere else.
 *
 * Every outcome carries `punchedAt` — the moment of the tap — because that is the
 * punch's time whenever it is finally sent (D15).
 */
export type PunchSubmitOutcome =
  | { kind: 'APPLIED'; punchedAt: string; result?: PunchResult }
  | { kind: 'QUEUED'; punchedAt: string }
  | { kind: 'BLOCKED'; punchedAt: string; reason?: ParkReason; detail: string }
  | { kind: 'NOT_SAVED'; detail: string };

type Deps = {
  queue?: OfflineQueue;
  live?: typeof submitPunchLiveAction;
  online?: () => boolean;
  timeoutMs?: number;
  deviceId?: () => string;
  now?: () => Date;
  newKey?: () => string;
};

/**
 * Record a punch: straight through when there is signal, queued when there is not
 * — offline-capable, not offline-only.
 *
 * **The key is made HERE, at the tap** (Appendix B §B.2, K2: "generate it at send
 * time and a retried batch creates a second punch for the same person"). It is the
 * same key on the live attempt and on the queued copy, so a live request that timed
 * out after the server applied it comes back as DUPLICATE on replay, never as a
 * second punch. Unlike a production entry, a punch is one tap and one person, so a
 * fresh key per tap is right; the caller stops a second tap by remembering the
 * first, not by reusing a key.
 */
export async function submitKioskPunch(
  input: {
    direction: 'IN' | 'OUT';
    badgeCode: string;
    shiftId?: string;
    operatorId?: string;
    userId: string;
    label?: string;
  },
  deps: Deps = {},
): Promise<PunchSubmitOutcome> {
  const {
    queue = getOfflineQueue(),
    live = submitPunchLiveAction,
    online = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    timeoutMs = LIVE_TIMEOUT_MS,
    deviceId = getDeviceId,
    now = () => new Date(),
    newKey = newIdempotencyKey,
  } = deps;

  const punchedAt = now().toISOString(); // the device's clock, at the tap (D15)
  const envelope: QueuedWriteEnvelope<PunchPayload> = {
    key: newKey(),
    kind: input.direction === 'IN' ? 'attendance.punch_in' : 'attendance.punch_out',
    payload: {
      badgeCode: input.badgeCode,
      ...(input.shiftId ? { shiftId: input.shiftId } : {}),
      ...(input.operatorId ? { operatorId: input.operatorId } : {}),
    },
    clientRecordedAt: punchedAt,
    deviceId: deviceId(),
    queuedBy: input.userId,
  };

  const enqueue = async (): Promise<PunchSubmitOutcome> => {
    try {
      await queue.enqueue(envelope, input.label);
    } catch (error) {
      return {
        kind: 'NOT_SAVED',
        detail: `This tablet could not hold the punch until signal returns${error instanceof Error ? ` (${error.message})` : ''}.`,
      };
    }
    void queue.replay(); // a link that is merely slow should send it now
    return { kind: 'QUEUED', punchedAt };
  };

  if (!online()) return enqueue();

  let result: Awaited<ReturnType<typeof submitPunchLiveAction>> | 'timeout';
  try {
    result = await withTimeout(live(envelope), timeoutMs);
  } catch {
    // No verdict from the server — offline, a 5xx, an HTML error page. Not a refusal: queue it, same key.
    return enqueue();
  }
  if (result === 'timeout') return enqueue();

  switch (result.outcome) {
    case 'APPLIED':
    case 'DUPLICATE':
      return { kind: 'APPLIED', punchedAt, result: result.result };
    case 'RETRY':
      return enqueue();
    case 'PARKED':
    case 'REJECTED':
    default:
      return { kind: 'BLOCKED', punchedAt, reason: result.reason, detail: result.detail ?? 'That punch could not be recorded.' };
  }
}
