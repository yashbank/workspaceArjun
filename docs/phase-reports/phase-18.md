# Phase 18 · QA · quality, COA, documents and reports

**Date:** 2026-09-27   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-187, MIS-190, MIS-193, MIS-196, MIS-199, MIS-204, MIS-206, MIS-209, MIS-212,
MIS-219, MIS-267. Epic E7.

## First task
Read §1A, the `PHASE_LOG.md` tail, and `phase-reports/phase-17.md` — nothing pending for this
phase. The stamp's own note ("the reports page was NOT rendered... its leak is proven only at
function level") and the phase's own priority note (MIS-267 is "the highest-value test in this
phase") were both taken as the actual scope, over the generic Touches-file list (`qc.test.ts`,
`reports.test.ts`, `documents.test.ts`, `payroll.test.ts` do not exist as such — this codebase
splits by CONCERN across differently-named files; read what actually covers each module first).

## What was built
- **MIS-267 (priority):** new `reports-payroll-agreement.test.ts` — runs `getAttendanceReport`
  and `calculateMonthlyPayroll` against the SAME underlying attendance rows. Found **new F-39**:
  they disagree. The report undercounts `present` (silently drops HALF_DAY, which `payroll.ts`
  explicitly counts as present — its own comment calls this "a POLICY, not an attendance fact",
  applied on only one side) and undercounts `late` (checks a literal `status === 'LATE'` the
  punch-derived day-builder never writes, instead of `lateMinutes > 0`, the way `attendance.ts`'s
  own reader of this same data correctly does). Both asserted spec-correct under `it.fails`; the
  ordinary-case agreement (no half-days, no late-without-status) passes, proving the fixture
  itself is sound.
- **MIS-196:** `rule-history.test.ts` already proves statically that only `recordAqlSample`
  reads AQL thresholds and the stored row has no rewritable column. New `qc-aql-decisions.test.ts`
  adds the FUNCTIONAL proof the acceptance check asks for: record a sample, tighten
  `AQL_MAJOR_MAX`, record another (now correctly rejected), re-read the first — still `PASS`.
  Passes; locks the spec, no new bug (same shape as Phase 17's transition-table cases).
- **MIS-199:** same file — proves reject→rework→re-sample→accept end to end (there is no
  dedicated "rework" state; the workflow is `recordAqlSample` called again after a rejection). A
  REJECT never blocks or taints a later, independent ACCEPT for the same order.
- **MIS-206:** new `documents.test.ts` (5 tests) — permission gating for `listDocuments` (needs
  `orders.read`), `addDocument`/`deleteDocument` (need `orders.write`), and that the uploader is
  recorded by auth id, not profile id (the module's own documented distinction). Versioning is
  **confirmed not built at all** (no `version`/`supersedesId` column — matches already-logged
  F-23) and there is no rename/update function to test retrieval-after-rename against — re-
  confirmed, not a new discovery.
- **MIS-193:** MIS's only notification-writing path (`job-phases.ts`'s sign-off handover) was
  already thoroughly covered — cited, not duplicated. The notification inbox itself is a
  separate, already-logged gap (F-29).
- **MIS-209:** flagged as a scope question rather than tested against code outside this
  module's ownership — `documents.ts` never touches storage itself (`filePath` is a pre-existing
  string), and the actual storage system (`src/server/storage`) carries no `mis` path segment
  per this module's own standing rule ("a path without a mis segment is wrong — ask").
- **MIS-187/190:** UI/component-level (checklist rebuild, filling a shift's grid) — not run as
  Vitest; noted for a browser walkthrough this environment does not have this session.
- **MIS-204/212/219:** written as numbered manual scripts in `qa/quality-walkthrough.md` and new
  `qa/coa-overlay.md` (a template table, matching Phase 16's `print-comparison.md` shape).

## Decisions cited
None new. D6 (QC decisions never recomputed) and D4 (visibility seam) were cited from existing
tests, not restated.

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: **200 files, 4268 passed + 15
expected-fail** (was 197/4260 — 3 new files, +10 tests, 2 new `it.fails`). No `pnpm build` —
tests/docs only, no application code changed.

## What changed for later phases
None.

## Pending
F-39 (real bug, small fix — align `getAttendanceReport`'s present/late logic with
`payroll.ts`/`attendance.ts`'s own definitions — left for a build phase). MIS-187/190/204/212/219
need a browser/device/volume-seed session. MIS-209 needs a scope decision (does E7 actually own
the shared storage system, or should this ticket move).

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-18.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/app/docs/qa/quality-walkthrough.md
- Arjun/app/docs/qa/coa-overlay.md
