# Phase 22 · Unclaimed gaps — things no ticket owns

**Date:** 2026-09-27   **Model:** sonnet   **Result:** DONE
**Tickets:** 22.1/22.2/22.3 as named in this phase's own `DEVELOPMENT_GUIDE.md` section — no
Jira access this session to raise 22.1/22.2/22.3 as real tickets, per the phase's own
instruction. Flagged here, not fabricated (same precedent as Phase 23's missing ticket).

## First task
Read §1A, the `PHASE_LOG.md` tail, and `phase-reports/phase-18.md` — nothing pending. This is
the last phase of Session B's own track (15→16→17→18→22), picked up directly.

## 22.2 — the orphan migration (done already, confirmed)
Re-checked rather than assumed: `prisma/migrations-pending/` is empty, and
`prisma/migrations/20260915000000_mis_po_purpose/` exists and is applied —
`MisPurchaseOrder.purpose` is a real column, used by Phase 21's buffer-drift report and Phase
23's kind-permission mapping. This was resolved as a side effect of Phase 21's own schema-gate
work (re-dated and applied, the first of the ticket's two options) — closing it here, not
redoing it.

## 22.3 — stale seed scripts (a real decision, confirmed with Arjun before deleting)
`seed-demo.ts`/`seed-reset.ts` were genuinely broken against the current schema (wrong enum
values, field names that no longer exist — `bomNumber`, `stageNo`, `key` instead of `ruleKey`,
`inTime` instead of `clockIn`) — 10+ real errors, invisible because `tsconfig.json` excludes
`prisma/**` entirely. Repairing would mean substantially rewriting a 20KB generator against
every schema change since it was last touched — its own separate undertaking. **Deleted both**,
along with the `demo:seed`/`demo:reset` package.json scripts (per Arjun's own confirmation —
"delete both"). Updated `CLAUDE.md`, `README.md`, `MIS_UI_SPEC.md` to remove now-inaccurate
guidance (the old `grep -v seed-demo` tsc-filter instruction, the README's demo-data section).
Left `demo:clear-activity`/`demo:cleanup-files` untouched — different scripts, not named by
this ticket, not checked this session.

## 22.1 — the order/phase picker (the real build)
`allocateMachine` (`machines-board.ts`) already fully supported `jobPhaseId` — validated
(belongs to the right order, must be an active status), tested (`worker-allocation.test.ts`,
`machines-board.test.ts`). The gap was entirely the FE: `machine-board-screen.tsx` had no way
to choose an order or phase, only a free-text `jobRef` input.

Built: a new server action `getOpenPhasesForOrderAction` (filters `getPhasesForOrder` to
`isActiveStatus` phases only — the picker never offers a choice the server would refuse
anyway); the allocation `SlideOver` now has a cascading Order → Phase `Select` pair (picking an
order loads its open phases) instead of the free-text field, wired to send `jobPhaseId` to
`allocateMachineAction`. `jobRef` stays fully readable for historical allocations (the board's
own "currently running" display line was never touched) — only the WRITE path changed, per the
ticket's own instruction. `kit/input.tsx`'s `Select` gained a `disabled` prop (a real, small,
pre-existing gap next to `Input`'s own HTML-attribute passthrough — needed to disable the Phase
select until an order is chosen) — a shared-kit fix, not a one-off.

**MIS-261 is now satisfied**: the picker exists, `allocateMachine` refuses an inactive/wrong-
order phase exactly as before. No new business logic — `allocateMachine`/`getPhasesForOrder`
were already correct and already tested; only the FE reaches them properly now.

## Decisions cited
None new. D9/D10 (job card = order; a phase belongs to one order) were the existing rule this
phase's picker enforces, not reinterprets.

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: **200 files, 4268 passed + 15
expected-fail** — unchanged from Phase 18 (no new test files; the logic this phase's FE change
reaches — `allocateMachine`, `getPhasesForOrder`, `isActiveStatus` — was already tested, and
`machine-board-screen.tsx` has no dedicated component test, matching this codebase's existing
convention for list/board screens). `pnpm build`: passes, every route.

## What changed for later phases
None.

## Pending
No manual browser walkthrough of the new picker this session (no dev server running). A human
should click through it once before relying on it in production.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-22.md
- Arjun/app/docs/qa/FINDINGS.md
