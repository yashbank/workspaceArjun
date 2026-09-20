import { submitProductionLiveAction } from '@/app/(mis)/mis/production/actions';
import { getDeviceId } from '@/lib/mis/offline/device';
import { type ParkReason, type QueuedWriteEnvelope } from '@/lib/mis/offline/idempotency';
import { getOfflineQueue, type OfflineQueue } from '@/lib/mis/offline/queue';
import type { ProductionLogPayload } from '@/server/mis/production';

/**
 * What happened to a production entry, in the terms a screen needs.
 *
 *  - `APPLIED` — it landed (or it had already landed and this was a duplicate).
 *  - `QUEUED`  — saved on this device and will send when signal returns. The
 *    person is done; the sync indicator carries it from here.
 *  - `BLOCKED` — a gate refused it *live*, while they are standing at the
 *    screen. Nothing was recorded anywhere, so they can fix the cause and tap
 *    Log again (Appendix B §B.10.1).
 *  - `NOT_SAVED` — the one outcome that must never be hidden: there was no
 *    signal AND this device could not hold the entry. The form must keep its
 *    values, because the entry exists nowhere else.
 */
export type SubmitOutcome =
  | { kind: 'APPLIED' }
  | { kind: 'QUEUED' }
  | { kind: 'BLOCKED'; reason?: ParkReason; detail: string }
  | { kind: 'NOT_SAVED'; detail: string };

/**
 * How long a live attempt may take before the connection is treated as gone.
 *
 * Factory wifi is often *connected and dead* rather than off, and `fetch` will
 * wait a very long time on it. Without a limit the button would spin for a
 * minute while the supervisor stands at the press. Timing out is safe by
 * construction: the entry is queued under the **same key**, so if the server had
 * in fact applied it, the replay returns DUPLICATE with the original result.
 */
export const LIVE_TIMEOUT_MS = 8_000;

type Deps = {
  queue?: OfflineQueue;
  live?: typeof submitProductionLiveAction;
  online?: () => boolean;
  timeoutMs?: number;
  deviceId?: () => string;
  now?: () => Date;
};

/** Resolves with the promise, or `'timeout'` — and always clears its timer, so no submit leaves one behind. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/**
 * Record production: straight through when there is signal, queued when there
 * is not — *offline-capable, not offline-only* (MIS-86).
 *
 * **The caller owns the key**, and makes it when the entry form is opened, not
 * when the button is pressed (Appendix B §B.2: generated at the action, carried
 * unchanged through every retry). One key per form means a fast double-tap sends
 * the same key twice and the server keeps one row — even if both presses get
 * through the button's disabled state. A key made per press would make each tap
 * a separate entry. It is reused after a refusal or a failed save (nothing, or
 * possibly one write, exists under it) and replaced only once the entry has
 * landed or been queued.
 *
 * `clientRecordedAt` *is* taken here, at the press: the moment the person
 * decided is the business time (D15), not the moment they opened the form.
 *
 * `jobPhaseId` is deliberately absent from the payload: the phase is re-resolved
 * on the server at the moment the write lands, never trusted from a device that
 * may have been offline for hours (Appendix A §A.8).
 */
export async function submitProduction(
  input: { key: string; payload: ProductionLogPayload; userId: string; label?: string },
  deps: Deps = {},
): Promise<SubmitOutcome> {
  const {
    queue = getOfflineQueue(),
    live = submitProductionLiveAction,
    online = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    timeoutMs = LIVE_TIMEOUT_MS,
    deviceId = getDeviceId,
    now = () => new Date(),
  } = deps;

  const envelope: QueuedWriteEnvelope<ProductionLogPayload> = {
    key: input.key,
    kind: 'production.log',
    payload: input.payload,
    clientRecordedAt: now().toISOString(),
    deviceId: deviceId(),
    queuedBy: input.userId,
  };

  const enqueue = async (): Promise<SubmitOutcome> => {
    try {
      await queue.enqueue(envelope, input.label);
    } catch (error) {
      // No signal and nowhere to keep it. Say so; never report success.
      return {
        kind: 'NOT_SAVED',
        detail: `This device could not hold the entry until signal returns${error instanceof Error ? ` (${error.message})` : ''}. Do not clear it — try again, or write it down.`,
      };
    }
    // Kick a pass so an entry saved while the link is merely slow goes out now.
    void queue.replay();
    return { kind: 'QUEUED' };
  };

  if (!online()) return enqueue();

  let result: Awaited<ReturnType<typeof submitProductionLiveAction>> | 'timeout';
  try {
    result = await withTimeout(live(envelope), timeoutMs);
  } catch {
    // The request never got an answer — offline, a 5xx, an HTML error page. Not
    // a verdict from the server, so it is not a refusal: queue it, same key.
    return enqueue();
  }
  if (result === 'timeout') return enqueue();

  switch (result.outcome) {
    case 'APPLIED':
    case 'DUPLICATE':
      return { kind: 'APPLIED' };
    case 'RETRY':
      // A transient server-side failure, or a signed-out session. Keep it.
      return enqueue();
    case 'PARKED':
    case 'REJECTED':
    default:
      return {
        kind: 'BLOCKED',
        reason: result.reason,
        detail: result.detail ?? 'That entry could not be recorded.',
      };
  }
}

/** Is this the kind of refusal the "Clear the line" button can address? */
export function isClearanceBlock(reason: ParkReason | undefined): boolean {
  return reason === 'CLEARANCE_EXPIRED' || reason === 'CLEARANCE_MISSING';
}
