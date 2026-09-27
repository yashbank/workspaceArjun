# Phase 15 · QA · masters, import and test fixtures

**Date:** 2026-09-27   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-66 (batch traceability), MIS-75 (import edge cases), MIS-91 (test factories +
seed idempotency). Epics E2/E8.

## First task
Read §1A, the `PHASE_LOG.md` tail, and `phase-reports/phase-14.md` — its own "Pending" list
(F-01/F-02/F-03/F-08/F-10) was already fixed by Phase 14F, well before this session; the section's
own "⚠ UPDATED BY PHASE 14" stamp (fixtures need a real `managerId` tree, shared test helpers
already exist in `server/mis/testing/`, sonnet not haiku) is the current instruction and was
followed. Nothing else was pending for this phase specifically.

## What was built
- **MIS-91:** `src/test/factories/mis.ts` (new) — `makeEmployee`/`makeItem`/`makeOrder`/
  `makePurchaseOrder`/`makePoItem`/`makeBomMaterial`/`makeAttendance`, each a realistic-shaped
  row with sequential ids and a `resetFactorySequence` for isolation, matching the existing
  `people-world.ts` convention. `mis.test.ts` (6 tests) proves the factories themselves. Seed
  idempotency (`pnpm db:seed`) is confirmed **by reading the code**, not executing it —
  `prisma/seed.ts` connects to a real Postgres client at import time and cannot be unit-tested
  without either an application-code refactor (out of scope: tests only) or a real database this
  environment lacks; every write in it is an `upsert` or a `findFirst`-guarded `create`, both
  idempotent by construction. Documented in `qa/masters-walkthrough.md` for a human to actually
  run once against a real/staging database.
- **MIS-75:** `src/app/api/mis/inventory/import/route.test.ts` (new, 9 passing + 1 `it.fails`) —
  empty sheet, missing `Name` column, wrong extension, the 146-row happy path, template-row
  exclusion, duplicate code/SKU within one file (updates, never throws or duplicates), an
  unrecognised unit/category falling back to its default. Found a real bug: an item code
  containing `/` is stored verbatim (MIS_UI_SPEC §3 says codes use `-`, never `/`) — logged as
  **new F-36**, asserted as the spec-correct behaviour under `it.fails` per this project's own
  convention for a QA-phase finding.
- **MIS-66:** read `traceability-view.test.ts` in full (27 tests) before writing anything — its
  `describe('the lot', …)` block already covers batch-number search, case-insensitivity,
  post-receipt issue tracking, the D4 visibility seam, and near-miss/precedence rules. No gap
  found worth a new test; cited in `qa/masters-walkthrough.md` rather than duplicated.
- `docs/qa/masters-walkthrough.md` (new) — a code-level trace of both features with a pointer to
  which test proves each case, same shape as Phase 20's `store-walkthrough.md`.

## Decisions cited
D1 (a legacy PO with no `bomRef` reads as buffer stock — the same logic `poPurpose` uses, cited
by the traceability read, not re-derived). No new D-number this phase.

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: **195 files, 4236 passed + 10
expected-fail** (was 193/4221 — 2 new files, +15 tests). `pnpm build`: passes, every route.

## What changed for later phases
`src/test/factories/mis.ts` now exists — phases 16–18 should reach for it before hand-rolling a
fixture for Order/Item/PO/BOM/Employee/Attendance shapes.

## Pending
F-36 (item code `/` — a real bug, one-line fix, left for a build phase). Seed idempotency needs a
human to actually run `pnpm db:seed` twice against a real database once one exists.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-15.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/app/docs/qa/masters-walkthrough.md
- Arjun/app/src/test/factories/mis.ts
