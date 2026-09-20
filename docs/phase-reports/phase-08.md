# Phase 8 · Worker allocation to process, machine and shift

**Date:** 2026-09-19   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-260, MIS-262, MIS-263

## What was built (Half A — schema.prisma + migrations-pending only)

- `prisma/schema.prisma` — new `MisWorkerAllocation` model, hanging off
  `MisMachineAllocation` (matches the ticket's technical notes exactly: no duplicated job/
  process/time window). Back-relations on `MisMachineAllocation`, `MisEmployee`,
  `MisJobPhase`, `MisShift`.
- `prisma/migrations-pending/20260921000000_mis_worker_allocations/migration.sql` —
  additive `CREATE TABLE`, two lookup indexes, rollback block. **Deliberately no overlap
  constraint or unique index** — see below.
- `src/lib/mis/shift-window.ts` (**new**, + 13 tests) — the shift-window arithmetic that
  was privately duplicated in `attendance.ts` (MIS-233) and again in `line-clearance.ts`
  (Phase 6). Both were refactored to import it rather than write a third copy, which is
  what "reuse the shared shift-window helper — do not write a second one" now means in
  practice. `attendance.test.ts` doesn't exist yet, but `line-clearance.test.ts` (76 tests)
  and `job-phases.test.ts` still pass unchanged, confirming the refactor is behaviour-
  preserving.
- No TypeScript references `MisWorkerAllocation` yet, per the schema-gate rule.

**Verify:** `tsc --noEmit --skipLibCheck` silent · `pnpm vitest run` 532/532 (added: 13
shift-window tests; unchanged: everything else).

## A correction to this phase's own acceptance check

The guide's Acceptance Check said *"Overlap is prevented by a database constraint, the
same way machine allocation does it."* Two things are wrong with that sentence, both found
by reading the actual tickets (not skimmed — read in full) rather than the guide's summary:

1. **Machine allocation does not use a database constraint.** `allocateMachine()` in
   `machines-board.ts:40-56` is a `findFirst`-then-`create` read-then-write check in
   application code. There is no exclusion constraint or unique index backing it anywhere
   in the schema. "Mirror its allocation approach" (this phase's own prompt) means mirror
   *that* — which the migration's own comment now says explicitly, so nobody adds one
   later believing they're restoring something that used to be there.
2. **MIS-260 and MIS-262 explicitly want the opposite of a constraint for workers.**
   MIS-260 Gherkin: *"the system warns which assignment is in the way, and allows it only
   with a deliberate confirmation, recorded."* MIS-262: *"Overlap **warns** — unlike
   machines, which the database refuses. Write a comment explaining the asymmetry so
   nobody later 'fixes' it into a constraint."* This is not ambiguous and not a new
   decision to record — the ticket already decided it, with the rationale that a person,
   unlike a machine, genuinely can be pulled between jobs mid-shift.

Half B builds `assignWorkers()` as: per employee, check for an existing active allocation
on the same `(allocationDate, shiftId)`; if found and the caller has not confirmed, return
it as a warning naming the conflicting job and machine (MIS-263) and skip that employee;
if confirmed, create anyway and audit the override. The rest of the crew in the same call
is unaffected by one person's conflict.

## Decisions cited
**D5** (now DECIDED, not OPEN — the status board line was stale and has been corrected to
match its own section): only people narrow by pool. `assignWorkers`/`getWorkerAvailability`
compose `resolveVisibleEmployeeWhere` from `visibility.ts` for the crew *candidates*; the
machine allocation itself stays unscoped, per D5's explicit machine carve-out. **D4** for
the resolver's own semantics (unchanged, cited not restated). No new D-number needed — the
overlap-warning behaviour above is decided by the ticket text, not assumed by this phase.

## What changed for later phases
None yet — Half B may still touch Phase 9 (it wires the same allocation tables) and the
supervisor-home crew card; that stamp lands with Half B once the surfaces exist.

## Pending — the next agent must do this first
**The gate.** Human runs from `Arjun/app`:
```bash
mv prisma/migrations-pending/20260921000000_mis_worker_allocations prisma/migrations/20260921000000_mis_worker_allocations
pnpm db:deploy && pnpm db:generate
```
Then Half B in a fresh session: MIS-262 (BE — `src/server/mis/worker-allocation.ts`:
`assignWorkers`, `releaseWorker`, `getWorkerAvailability(shiftId, date)`, one grouped query,
pool-scoped via `visibility.ts`) with its checker, then MIS-263 (FE —
`src/components/mis/machines/worker-board-screen.tsx`, crew-of-N assignment in one action,
the overlap warning naming the conflict, the supervisor home's "My crew today" card wired
to real data) only once 262's checker returns PASS.

## What was built (Half B — MIS-262 then MIS-263, phase complete)

**MIS-262 (BE)** — checker passed (tsc silent, lint clean, 552/552 tests) before MIS-263
started.
- `src/server/mis/worker-allocation.ts` — **new**. `assignWorkers` (crew-of-N, one call;
  overlap on `(employeeId, allocationDate, shiftId)` **warns and records**, never refuses —
  confirmed via `confirmOverlapFor`, audited with the conflicting row's id), `releaseWorker`,
  `getWorkerAvailability(shiftId, date)` (constant 3 queries regardless of pool size),
  `getCrewSummary(date)` (pool-scoped "My crew today", mirroring
  `getDayAttendanceSummary`'s present/absent/on-leave arithmetic but composed with
  `resolveVisibleEmployeeWhere` — D4/D5). Candidates are `WORKER`/`QC` roles only, per
  MIS-260's own Gherkin ("sees and assigns only workers and QC").
- `src/server/mis/navigation.ts` — the SUPERVISOR "Crew" bottom-nav badge changed from
  clock-out-approval count (which moved to the sign-off card in Phase 7) to free-worker
  count, matching what the tab now opens.
- 20 tests in `worker-allocation.test.ts`, including the asymmetry itself: an overlap
  warns and does not create; a confirmed one creates and audits the override; one
  conflicted worker never blocks the rest of the crew.

**MIS-263 (FE)**
- `src/components/mis/machines/worker-board-screen.tsx` + route `/mis/crew` — staffed
  machines with a crew count, a free-worker list with clock-in status, an "Assign crew"
  slide-over that multi-selects and submits in one action, and the overlap warning naming
  the conflicting machine/order/process with an explicit "Assign anyway" confirm.
- `src/components/mis/home/bottom-nav.tsx` — the Crew tab now points at `/mis/crew`
  instead of `/mis/attendance` (a placeholder that predates this feature — the same
  slot-reuse pattern Phase 6 and 7 each found and fixed once already).
- `src/app/(mis)/mis/page.tsx` — the supervisor home's "My crew today" card now reads
  `getCrewSummary()` instead of the factory-wide `getDayAttendanceSummary()`.
- `src/lib/mis/i18n/dictionaries.ts` — 20 `crew.*` keys, English and Hindi.

**Verify:** `tsc --noEmit --skipLibCheck` silent · `pnpm vitest run` **552/552** ·
`pnpm build` clean, route `/mis/crew` present.

## Decisions cited (addition)
**D4/D5** for the pool-scoping split — candidates scoped, the machine board not. No new
D-number: the warn-not-refuse overlap behaviour is MIS-260/262's own explicit instruction
(quoted in Half A), not an assumption this phase made.

## What changed for later phases (addition)
**Phase 9** stamped — `MisWorkerAllocation.jobPhaseId` already exists; Phase 9's job-card
wiring is now only `MisMachineAllocation`.

## Pending — the next agent must do this first (supersedes Half A's note)
Nothing for Phase 8. **Not built, deliberately:** a UI for `deletedAt` (soft-deleting a
genuinely mistaken assignment, distinct from `releaseWorker`'s normal end-of-shift release)
— no ticket asked for it and the column exists for a future correction path, per the schema
comment. A phase that needs it should add one function, not reach for `update()` directly.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-08.md
