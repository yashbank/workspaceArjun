import { cache } from 'react';

import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/server/db';

import type { MisActor } from './auth';
import { getMisEmployee } from './roles';

/**
 * Which rows may this user see?
 *
 * The rule is **D4** — read it in `docs/DECISIONS.md`. This module is the only
 * place it is expressed, so answering the question D4 leaves open costs a
 * change here and nowhere else. Call sites compose a `where` fragment; none of
 * them knows what the rule is.
 */

/** Bad data must never hang a request: a cyclic managerId stops at this depth. */
const MAX_DEPTH = 10;

/**
 * `null` means **unscoped — see everything**. It is deliberately not the same
 * as `[]`, which means **sees nobody**.
 *
 * Collapsing the two is the bug this type exists to prevent: read as `[]`, an
 * Owner's full list renders empty; read as `null`, an empty pool renders the
 * entire factory.
 */
export type VisibleIds = string[] | null;

/**
 * Is there an org chart at all?
 *
 * D4 describes a tree, and `mis_employees.manager_id` is the column that holds
 * it — but nothing in the product writes that column yet (there is no
 * assign-a-manager surface, and no seed sets one). Until at least one link
 * exists there is no tree to descend, and narrowing every list to "just you"
 * would empty screens that work today.
 *
 * So: no links → unscoped. The moment a real hierarchy is entered, D4 applies
 * everywhere that composes this module, with no further code change.
 *
 * Known sharp edge, and the reason this is flagged rather than silent: a
 * *partially* entered org chart scopes everyone who was missed down to
 * themselves. An org chart must be entered completely, in one go.
 */
const isHierarchyInUse = cache(async (): Promise<boolean> => {
  const anyLink = await db.misEmployee.findFirst({
    where: { managerId: { not: null }, deletedAt: null },
    select: { id: true },
  });
  return anyLink !== null;
});

/**
 * Everyone below `rootId`, breadth-first — one query per level of the tree,
 * never one per employee. That is what keeps this off the N+1 path.
 */
async function descendantIdsOf(rootId: string): Promise<string[]> {
  const found = new Set<string>();
  let frontier = [rootId];

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth += 1) {
    const rows = await db.misEmployee.findMany({
      where: { managerId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });

    // Skipping ids already seen is also what terminates a managerId cycle;
    // MAX_DEPTH is the backstop, not the primary guard.
    const next = rows.map((r) => r.id).filter((id) => id !== rootId && !found.has(id));
    for (const id of next) found.add(id);
    frontier = next;
  }

  return [...found];
}

/**
 * Resolved once per request: React `cache()` keys on the two primitives, so a
 * layout, a page and three lists asking the same question cost one descent.
 */
const resolveIdsFor = cache(async (userId: string, role: string): Promise<VisibleIds> => {
  // The Owner is the root of the tree (D4), so there is nothing to narrow.
  // Deriving that from the manager chain instead would hide any row whose
  // chain does not happen to reach them — an orphan would vanish from the one
  // list that must always be complete.
  if (role === 'OWNER') return null;

  if (!(await isHierarchyInUse())) return null;

  const self = await getMisEmployee(userId);
  // No employee record is not an error (MIS_UI_SPEC §2) — it is someone with
  // no place in the tree, so their pool is empty rather than everything.
  if (!self) return [];

  return [self.id, ...(await descendantIdsOf(self.id))];
});

export async function resolveVisibleEmployeeIds(actor: MisActor): Promise<VisibleIds> {
  return resolveIdsFor(actor.userId, actor.role);
}

/**
 * Would `candidateId` become an ancestor of itself if assigned as
 * `employeeId`'s manager? True for `candidateId === employeeId` (an employee
 * cannot manage themselves) and for any existing descendant of `employeeId`
 * (assigning one as manager would close a loop back to `employeeId`).
 *
 * This is the one guard `employee.ts` needs before writing `managerId` — the
 * resolver's own breadth-first descent is reused rather than re-walked.
 */
export async function wouldCreateManagerCycle(
  employeeId: string,
  candidateId: string,
): Promise<boolean> {
  if (candidateId === employeeId) return true;
  const descendants = await descendantIdsOf(employeeId);
  return descendants.includes(candidateId);
}

/**
 * Was this caller's list narrowed at all?
 *
 * A screen needs this to tell "there is nobody here" apart from "there is
 * nobody here *that you can see*" — two different sentences, and showing the
 * wrong one sends someone off to add a person who already exists. The answer
 * is computed here and handed down; the screen never works the rule out for
 * itself, and never receives a row it may not see in order to count it.
 */
export async function isPoolScoped(actor: MisActor): Promise<boolean> {
  return (await resolveVisibleEmployeeIds(actor)) !== null;
}

export async function resolveVisibleEmployeeWhere(
  actor: MisActor,
): Promise<Prisma.MisEmployeeWhereInput> {
  const ids = await resolveVisibleEmployeeIds(actor);
  return ids === null ? {} : { id: { in: ids } };
}

/**
 * Attendance belongs to an employee, so it scopes through the people scope —
 * a consequence of D4 rather than a second rule. The direct foreign key beats
 * a nested relation filter for the same result.
 */
export async function resolveVisibleAttendanceWhere(
  actor: MisActor,
): Promise<Prisma.MisAttendanceWhereInput> {
  const ids = await resolveVisibleEmployeeIds(actor);
  return ids === null ? {} : { employeeId: { in: ids } };
}

/**
 * Machines are **not** narrowed, deliberately.
 *
 * D4 settles which *people* a user sees; it says nothing about machines. The
 * approved Supervisor home (`MIS_UI_SPEC.md` §4.6) renders the shop with an
 * explicit count of how many machines are visible, so narrowing here on a
 * guess would contradict a screen that has already been signed off.
 *
 * The seam is real: this is the single function to change when that question
 * is answered. See the Phase 2 report for the open decision.
 */
export async function resolveVisibleMachineWhere(
  _actor: MisActor,
): Promise<Prisma.MisMachineWhereInput> {
  return {};
}

/**
 * Orders are **not** narrowed, deliberately.
 *
 * `MisOrder` carries no employee, crew or department column — only a customer
 * and a creator — so there is nothing D4 describes to scope it by. Scoping on
 * the creator instead would hide from an Admin the orders their own home
 * screen is specified to list.
 *
 * Same seam, same single point of change, same open decision.
 */
export async function resolveVisibleOrderWhere(
  _actor: MisActor,
): Promise<Prisma.MisOrderWhereInput> {
  return {};
}
