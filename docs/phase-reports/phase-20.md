# Phase 20 · QA · store/PO, scheduling and platform

**Date:** 2026-09-26   **Model:** sonnet   **Result:** DONE (for what a QA pass in this
environment can do — three tickets need hardware/a live deploy and are logged, not run)
**Tickets:** MIS-279, MIS-98, MIS-264, MIS-266, MIS-81, MIS-84, MIS-87, MIS-89, MIS-93 (Epics E9/E4/E8)

## First task
Read §1A, the `PHASE_LOG.md` tail, and `phase-reports/phase-19.md`. Nothing was marked pending
for this phase specifically. `CHANGE_PO_WITHOUT_BOM.md` §4 read for MIS-279's six cases; D1 and D4
read and cited below, never restated.

## MIS-279 — buffer-stock PO + partial-receipt arithmetic (the real gap)
**No `po.test.ts` or any GRN/store-receive test existed before this phase** — the buffer-stock
feature (`lib/mis/po-purpose.ts`, `createPO`, `commitReceipt`) was built (a prior, unlogged
change) but never tested. Built:
- `src/lib/mis/po-purpose.test.ts` (4 tests) — the pure derivation, including case 6 (a legacy
  `bom_ref IS NULL` row reads as buffer stock).
- `src/server/mis/po-buffer-stock.test.ts` (8 tests, new fake db built for this file) — cases
  1–5 from CHANGE_PO_WITHOUT_BOM.md §4 (buffer PO end-to-end, FOR_ORDER-with-no-ref refused, a
  stale ref stripped on switching purpose, classification-on-issue, no surface treats it as an
  error), plus **this phase's own acceptance check**: order 100, receive 40 then 35, assert
  outstanding/ledger/PO status after EACH step (`PARTIAL` at 75, never auto-completing short of
  100), then complete it. D1 is cited, not re-tested: `commitReceipt` posts every delivery to the
  same general ledger regardless of purpose, so nothing today could charge an order at receipt
  time either way.
- `docs/qa/store-walkthrough.md` — a code-level trace of both paths with a pointer to which test
  proves each step (no browser walk; no dev server was running this session).

## MIS-98 / MIS-264 / MIS-266 — allocation concurrency, availability, the job-card seam
**Already thoroughly covered** by `worker-allocation.test.ts` (25 tests: conflict warning, named
conflict detail, explicit-override, D4 pool-scoping, phase-gating, the "not a jobPhaseId at all"
case) and `machines-board.test.ts` (8 tests: overlap refusal, phase-order mismatch, REOPENED
accepted as open). Read all 33 test names; found no gap worth a new test. Cited, not duplicated.

## MIS-81 — touch-target audit
24G already swept the whole app against the measured tap-target list and raised the kit
defaults (`qa/UI-GAPS-24G.md`). The kit's OWN component tests only covered `Button`
(`button.test.tsx`, 24G) — added `src/components/mis/kit/tap-targets-kit.test.tsx` (5 tests):
`Input`/`NumberInput`/`DateInput`/`TimeInput`/`Select` each pinned at `min-h-12` (48px) /
`text-base` (16px), MIS_UI_SPEC's own rule, checked against `01-Foundations.png`'s input spec.
No full app re-walk (that's a browser-driven sweep, 24F/24G's own tool, not run here).

## The two sweeps (Phase 13's stamp / Phase 8's stamp)
**Timezone sweep (D22):** confirmed every load-bearing site the Phase 13 stamp named is STILL on
the server's clock (`getHours`/`setHours`/`getFullYear`/`getMonth()`), not the factory's zone —
QC's hourly grid (already F-18), worker-allocation and production day boundaries, a store
stock-count cutoff, and — newly catalogued — the PO/GRN/order document-number generators and the
Owner home's greeting/month-wage-bill call. Consolidated into **F-34** (exact file:line list) so
the scattered mentions across F-18/14F's note/this stamp point at one place. **Confirmed, not
fixed** — a QA phase does not touch application code; F-34 is scoped for the next build phase.

**Placeholder-wiring sweep (Phase 8's stamp):** read `(mis)/mis/page.tsx`'s six per-role screens
end to end (every card/badge's data source) and `server/mis/navigation.ts`'s `getNavBadges`.
Every card and badge names the function it calls and that function answers the question the
label asks — including the Phase 7/8 fixes' own defensive comments still in place (Supervisor's
"My crew" uses the pool-scoped `getCrewSummary`, not the factory-wide attendance count). **No new
drift found.**

## MIS-84, MIS-89, MIS-93 — manual walkthroughs, not run
- **MIS-84** (install + offline shell on a real device): needs a physical device/Expo app, same
  limitation as MIS-239/242 in Phase 19. Not run.
- **MIS-89** (prove CI gates block) and **MIS-93** (rollback rehearsal + smoke checklist):
  `docs/qa/release-smoke.md` (new) — a checklist to run once a real deploy exists (Phase 26),
  not an executed rehearsal; no staging environment or CI dashboard access this session.

## Decisions cited
D1 (buffer-stock costing — cited above, not re-derived). D4 (pool boundaries — already the
subject of the cited `worker-allocation.test.ts` cases). D22 (the timezone rule, F-34).

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: **191 files, 4170 passed + 9
expected-fail** (was 188/4153 — 3 new files, 17 new tests). No `pnpm build` — QA phase, tests/
docs only, no application code changed.

## What changed for later phases
None of this phase's findings change a LATER phase's scope beyond what F-34 already states
(a build phase should fix the timezone catalog).

## Pending
F-34 (timezone fixes — needs a build phase). MIS-84/89/93's real-world runs (device, CI, staging)
once those environments exist. Nothing blocks Phase 21.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-20.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/app/docs/CHANGE_PO_WITHOUT_BOM.md
