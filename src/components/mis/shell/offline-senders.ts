import { replayPunchAction } from '@/app/(mis)/mis/kiosk/actions';
import { replayProductionAction } from '@/app/(mis)/mis/production/actions';
import { recordPunchSent } from '@/components/mis/kiosk/punch-sync-log';
import type { OfflineQueue, QueuedItem, SendResult } from '@/lib/mis/offline/queue';
import type { PunchPayload, PunchResult } from '@/server/mis/attendance-punch';
import type { ProductionLogPayload } from '@/server/mis/production';

/**
 * The transports for every queueable kind — registered once, at startup.
 *
 * The queue itself imports no server action (Appendix B §B.9): it stores a
 * `kind` and a payload and asks whoever registered for that kind to send it.
 * This file is the *app layer* that registers them, so it is the one place a
 * queued write meets a server action. Adding a queueable kind means adding a
 * sender here — Phase 13 adds the kiosk punches.
 *
 * A sender returns the server's verdict as a value. If it throws (no network, a
 * 5xx, an HTML error page) the queue treats that as RETRY and backs off, which
 * is exactly right: nothing the server *decided* ever arrives as an exception,
 * because in a production build React would blank the message (§B.10.3).
 */
export function registerOfflineSenders(queue: OfflineQueue) {
  queue.register(
    'production.log',
    async (item: QueuedItem): Promise<SendResult> =>
      replayProductionAction(
        {
          key: item.key,
          kind: 'production.log',
          payload: item.payload as ProductionLogPayload,
          clientRecordedAt: item.clientRecordedAt,
          deviceId: item.deviceId,
          queuedBy: item.queuedBy,
        },
        item.humanRetry === true,
      ),
  );

  // Punches (Phase 13). One sender per direction, one queue — never a second (Appendix B).
  for (const kind of ['attendance.punch_in', 'attendance.punch_out'] as const) {
    queue.register(kind, async (item: QueuedItem): Promise<SendResult> => {
      const result = await replayPunchAction(
        {
          key: item.key,
          kind,
          payload: item.payload as PunchPayload,
          clientRecordedAt: item.clientRecordedAt,
          deviceId: item.deviceId,
          queuedBy: item.queuedBy,
        },
        item.humanRetry === true,
      );
      // K2's "11 / 14 sent" and its list of sent rows — with their ORIGINAL punch times.
      if ((result.outcome === 'APPLIED' || result.outcome === 'DUPLICATE') && result.result) {
        recordPunchSent(result.result as PunchResult);
      }
      return result;
    });
  }
}
