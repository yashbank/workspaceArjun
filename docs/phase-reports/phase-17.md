# Phase 17 · QA · production and wastage

**Date:** 2026-09-27   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-147, MIS-150, MIS-153, MIS-156, MIS-159, MIS-162, MIS-165, MIS-168, MIS-170.
Epic E6. Depends on Phases 6, 7, 11 (already run).

## First task
Read §1A, the `PHASE_LOG.md` tail, and `phase-reports/phase-16.md` — nothing pending for this
phase. Read the Phase 14/11/7 stamps on this section first: `production.test.ts` (41),
`idempotency.test.ts` (40), `job-phases.test.ts` (61, before this phase), and
`job-phases.gate.db.test.ts` (9, against a real database — confirmed it still runs: `DIRECT_URL`
is present in this environment, 3.8s wall time, writes nothing per its own SAVEPOINT design).

## What was built
- **MIS-147/MIS-165:** `job-phases.test.ts` gained `describe('every remaining ✗ cell in
  Appendix A §A.3…')` — 13 new tests, one per `(from, verb)` pair from the transition table with
  no test yet (every `restorePhase`/`reopenPhase` illegal-from case had none at all before). All
  refuse today: `job-phases.ts`'s own `TRANSITIONS` array already matches Appendix A exactly and
  `assertTransition` guards every verb — this locks the spec at the test level rather than
  reporting a bug (contrast Phase 16's `bom.ts` finding, F-37, where the equivalent guard was
  simply missing).
- **MIS-162:** new `src/test/fixtures/production-signoff.ts` — six fractional-quantity
  production-log entries with the output/waste/wastePercent arithmetic worked by hand in the
  file's own comments, checked into the repo so the expected numbers are auditable independent
  of the code under test (D13: checked against the previous phase's hand-over, never an order
  quantity — orders carry none). `job-phases.test.ts`'s sign-off-summary block ties out to it
  exactly, `wastePercent` to 10 decimal places.
- **MIS-150/156/159/168:** read the existing suites in full rather than duplicating —
  `idempotency.test.ts` already proves clearance-expiry parking and connection loss at every
  stage (Phase 11's own stamp); `line-clearance.test.ts` already proves the SUPERVISOR-and-above
  role boundary (D7); `traceability-view.test.ts`'s lot block already traces one batch across two
  different orders in a single case. MIS-168's correctness half is covered
  (`machines-board.test.ts`); its performance-at-scale half is **honestly not testable here** — a
  fake in-memory db has no query cost to measure, so a passing unit test would prove nothing.
  Needs a real, loaded database (same class of gap as Phase 20's MIS-84/89/93).
- **MIS-153/170:** written as numbered manual walkthrough scripts in
  `qa/production-walkthrough.md` — no real supervisor, printer or blank BPR form this session.

## Decisions cited
D7 (line-clearance role boundary — cited, not restated). D13 (orders carry no quantity column —
MIS-162's fixture is checked against the previous phase's hand-over for exactly this reason).

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: **197 files, 4260 passed + 13
expected-fail** (was 197/4246 — same file count, +14 tests: 13 transition-table cases + 1
fixture-tied-out case; `job-phases.gate.db.test.ts`'s 9 real-DB tests ran and passed as part of
this count). No `pnpm build` — tests/docs only, no application code changed.

## What changed for later phases
None.

## Pending
MIS-168's performance-at-scale half needs a real database, not this environment. MIS-153/170
need a real supervisor/printer/blank form.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-17.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/app/docs/qa/production-walkthrough.md
- Arjun/app/src/test/fixtures/production-signoff.ts
