import type { PunchResult } from '@/server/mis/attendance-punch';

/**
 * The punches this tablet has SENT since it last had nothing to send — K2's "11 / 14
 * sent" and its list of sent rows, each with its original punch time.
 *
 * The offline queue deletes an entry the moment the server applies it, so "what did
 * we already send?" is not something it can answer. This is a tiny in-memory log the
 * punch sender writes to and the kiosk screen reads. It is deliberately NOT durable:
 * it is a progress display, not a record — the record is the punch row on the server.
 * Reload the page and the list resets; nothing is lost, because nothing here was the
 * only copy of anything.
 *
 * No React: `useSyncExternalStore` in the screen subscribes to it, and tests drive it
 * directly.
 */

export type SentPunch = Pick<PunchResult, 'punchId' | 'employeeName' | 'direction' | 'punchedAt'>;

const MAX_ROWS = 200;

let sent: SentPunch[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Called by the punch sender when the server applies (or already had) a punch. */
export function recordPunchSent(result: PunchResult): void {
  // A duplicate answer arrives for a punch we may already have listed; list it once.
  if (sent.some((s) => s.punchId === result.punchId)) return;
  sent = [
    ...sent,
    { punchId: result.punchId, employeeName: result.employeeName, direction: result.direction, punchedAt: result.punchedAt },
  ].slice(-MAX_ROWS);
  emit();
}

/** Start the next batch — "Back to scanning". Only ever clears the DISPLAY. */
export function clearPunchSyncLog(): void {
  if (sent.length === 0) return;
  sent = [];
  emit();
}

/** A stable reference between changes, as `useSyncExternalStore` requires. */
export function getPunchSyncLog(): readonly SentPunch[] {
  return sent;
}

export function subscribePunchSyncLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The server snapshot is always empty — the log only exists in a browser session. */
export const EMPTY_PUNCH_LOG: readonly SentPunch[] = [];
