/**
 * R2-47 — the HARD worker lock, as pure rules (no Prisma, no React).
 *
 * A worker with an open allocation is BLOCKED: no other supervisor can assign them elsewhere for that
 * date and shift (`assignWorkers` refuses an OVERLAP for a supervisor) until they are released.
 * The HOLDER of the lock is the supervisor who assigned them (`MisWorkerAllocation.assignedById`).
 * Only the holder, an Admin or the Owner may release or move them.
 */
import type { MisRoleName } from './roles';

export type WorkerLockState = 'AVAILABLE' | 'BLOCKED';

const OVERRIDERS: readonly string[] = ['ADMIN', 'OWNER'];

/** AVAILABLE with no open row, BLOCKED with at least one. */
export function workerLockState(openRows: readonly unknown[]): WorkerLockState {
  return openRows.length > 0 ? 'BLOCKED' : 'AVAILABLE';
}

/**
 * May this person release (or move) a locked worker? The holder, an Admin or the Owner. A row with no
 * recorded holder predates the lock, so any supervisor who can see the person may release it.
 */
export function mayReleaseWorker(i: { role: MisRoleName | null | undefined; actorId: string; holderId: string | null | undefined }): boolean {
  if (i.role && OVERRIDERS.includes(i.role)) return true;
  if (!i.holderId) return true;
  return i.holderId === i.actorId;
}

/** Split a board into the Available and Blocked lists the supervisor sees, keeping the given order. */
export function splitByLock<T extends { allocations: readonly unknown[] }>(rows: readonly T[]): { available: T[]; blocked: T[] } {
  const available: T[] = [];
  const blocked: T[] = [];
  for (const r of rows) (workerLockState(r.allocations) === 'BLOCKED' ? blocked : available).push(r);
  return { available, blocked };
}
