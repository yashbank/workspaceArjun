import type { TranslationKey } from '@/lib/mis/i18n';
import { formatFactoryTime } from '@/lib/mis/factory-time';
import type { ParkReason } from '@/lib/mis/offline/idempotency';
import { isBlocked, type QueuedItem } from '@/lib/mis/offline/queue';

import type { SentPunch } from './punch-sync-log';

/**
 * What the kiosk's queue panel shows (K2) — pure, so every state of it is a test.
 *
 * Two facts the design turns on:
 *  - Sent rows show the ORIGINAL punch time: a 06:04 punch that syncs at 07:41 is
 *    listed as 06:04 (D15).
 *  - A failed row states what happened and who can fix it. Never a bare "failed".
 */

export const PUNCH_KINDS = ['attendance.punch_in', 'attendance.punch_out'] as const;

export function isPunchItem(item: QueuedItem): boolean {
  return (PUNCH_KINDS as readonly string[]).includes(item.kind);
}

export type PunchFailure = {
  key: string;
  titleKey: TranslationKey;
  /** K2's second line: "Scanned 06:47 · code BPP-8841" — or the person's name when known. */
  scanned: string;
  /** Who can put this right, in words. Empty when the operator can do it themselves. */
  hintKey: TranslationKey | null;
  /** Only an unrecognised badge can be fixed AT the tablet — by saying who it really was. */
  canFix: boolean;
  reason?: ParkReason;
  direction: 'IN' | 'OUT';
};

export type PunchQueueSummary = {
  /** Punches already delivered this batch. */
  sent: number;
  /** Not yet delivered and not stuck: the "N more waiting". */
  waiting: number;
  /** Stuck, and needing a person. */
  failed: PunchFailure[];
  /** sent + waiting + failed — the denominator of "11 / 14". */
  total: number;
  /** Seconds until the soonest retry, when something is backing off. */
  retryInSeconds: number | null;
  /** True when there is anything at all to show. */
  visible: boolean;
};

const FAILURES: Partial<Record<ParkReason, { title: TranslationKey; hint: TranslationKey | null; canFix: boolean }>> = {
  BADGE_UNKNOWN: { title: 'kiosk.fail.badgeUnknown', hint: null, canFix: true },
  EMPLOYEE_INACTIVE: { title: 'kiosk.fail.inactive', hint: 'kiosk.hint.admin', canFix: false },
  CORRECTION_WINDOW_CLOSED: { title: 'kiosk.fail.closedDay', hint: 'kiosk.hint.superOperator', canFix: false },
  CLOCK_SKEW: { title: 'kiosk.fail.clock', hint: 'kiosk.hint.superOperator', canFix: false },
  TOO_OLD: { title: 'kiosk.fail.tooOld', hint: 'kiosk.hint.superOperator', canFix: false },
  PREDECESSOR_PARKED: { title: 'kiosk.fail.predecessor', hint: 'kiosk.hint.superOperator', canFix: false },
  FORBIDDEN: { title: 'kiosk.fail.forbidden', hint: 'kiosk.hint.signIn', canFix: false },
};

const badgeOf = (item: QueuedItem): string => {
  const code = (item.payload as { badgeCode?: unknown } | null)?.badgeCode;
  return typeof code === 'string' ? code : '';
};

export function describePunchFailure(item: QueuedItem, timeZone: string): PunchFailure {
  const known = item.reason ? FAILURES[item.reason] : undefined;
  const at = formatFactoryTime(new Date(item.clientRecordedAt), timeZone);
  const code = badgeOf(item);
  return {
    key: item.key,
    titleKey: known?.title ?? 'kiosk.fail.other',
    // The scan time on the FACTORY's clock, and the code — what somebody needs to recognise it.
    scanned: code ? `${at} · ${code}` : at,
    hintKey: known ? known.hint : 'kiosk.hint.superOperator',
    canFix: known?.canFix ?? false,
    reason: item.reason,
    direction: item.kind === 'attendance.punch_in' ? 'IN' : 'OUT',
  };
}

export function summarisePunchQueue(
  items: readonly QueuedItem[],
  sent: readonly SentPunch[],
  timeZone: string,
  now: number,
): PunchQueueSummary {
  const punches = items.filter(isPunchItem);
  const failed = punches.filter(isBlocked).map((i) => describePunchFailure(i, timeZone));
  const waitingItems = punches.filter((i) => !isBlocked(i));

  const due = waitingItems
    .map((i) => i.nextAttemptAt)
    .filter((t): t is number => typeof t === 'number' && t > now);
  const retryInSeconds = due.length ? Math.max(1, Math.ceil((Math.min(...due) - now) / 1000)) : null;

  const total = sent.length + waitingItems.length + failed.length;
  return { sent: sent.length, waiting: waitingItems.length, failed, total, retryInSeconds, visible: total > 0 };
}
