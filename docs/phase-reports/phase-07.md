# Phase 7 · Phase sign-off & the handover gate

**Date:** 2026-09-19   **Model:** opus   **Result:** DONE
**Tickets:** MIS-142, MIS-163, MIS-164 (also completes the PARTIAL MIS-136 / MIS-145 / MIS-146)

## What was built (design + Half A — schema.prisma + migrations-pending only)

**The design, approved before any code, is `DEVELOPMENT_GUIDE.md` Appendix A.** It is the
specification: states, the transition matrix, who may perform each transition, the
sequential gate, the sign-off preconditions, the three database mechanisms, and how all of
it composes with D7/D8. Half B implements it; Phase 17 tests against it. Do not re-derive
it from the tickets — MIS-142 and MIS-145 contradict each other on reopening, and Appendix
A §A.2 records the reconciliation.

- `prisma/schema.prisma` — new `MisJobPhaseStatus` enum and `MisJobPhase` model (an
  **execution** row on `orderId`, not a status column on `MisBomStage`; see §A.1).
  Back-relations on `MisOrder`, `MisProcess`, `MisBomStage`, `MisEmployee`. Additive
  nullable columns: `MisProductionLog.jobPhaseId` + `wasteReason`, `MisQcCheck`
  `acknowledgedAt`/`acknowledgedById`/`acknowledgementNote`.
- `prisma/migrations-pending/20260920000000_mis_job_phases/migration.sql` — the table, a
  partial unique index on `(order_id, sequence)`, four `CHECK` constraints, and the
  `mis_job_phase_gate` trigger. Additive and reversible; rollback block included.
- `docs/MIS_UI_SPEC.md` §7.1 — **new**: what the trigger enforces and the exact error text
  it raises, so a future agent debugging a failed insert reads that instead of asking.
- No TypeScript references any of it yet, per the schema-gate rule.

**Verify:** `tsc --noEmit --skipLibCheck` silent · `npx prisma validate` passes ·
`pnpm vitest run` 449/449 (unchanged — schema-only).

## Two live-database findings that changed the design

Both came from querying the real database, and neither is guessable from the tickets.

1. **Only 3 of the 16 OWNER/ADMIN/SUPERVISOR employees have a login**, and 3 have a
   department. Defaulting a phase's in-charge by department lookup resolves to nobody, and
   "only the in-charge may sign" would have shipped permanently stuck job cards. Hence D12:
   the in-charge is whoever started the phase, and `reassignInCharge()` is the unstick.
2. **Five of the BPR's eleven work-flow processes already exist** in the live master under
   the client's own codes, alongside thirteen more. MIS-145's "seed the eleven BPR
   processes" taken literally would duplicate five real masters. Half B seeds **the six
   that are missing**, matched by name, from `PROC-020` (§A.1). `PROC-008` is a gap in the
   live sequence — do not reuse it.

Also worth knowing: the production table is **`mis_production_log`, singular**.

## Decisions cited
**D7** and **D8** — the phase gate composes with line clearance rather than wrapping it
(§A.8); `job-phases.ts` never calls `assertLineCleared`. **New: D9, D10, D11, D12** in
`DECISIONS.md`. D9 (the order is the job card) is the one to put to Arjun first — it
carries his question verbatim and scopes the fix in advance if he says an order can run two
job cards at once.

## What changed for later phases
- **Phase 7's own section** — Touches corrected: the module is `job-phases.ts`, not
  `phase.ts`, and the model is new rather than a column on `MisBomStage`.
- Phase 11 and Phase 17 stamps land with Half B, once the surfaces they name exist.

## Pending — the next agent must do this first
**The gate.** Human runs from `Arjun/app`:
```bash
mv prisma/migrations-pending/20260920000000_mis_job_phases prisma/migrations/20260920000000_mis_job_phases
pnpm db:deploy && pnpm db:generate
```
Then Half B in a fresh session: MIS-163 (BE — `job-phases.ts`, the transition table, the
six-process seed, `signOffPhase` preconditions, the `mis.phase_ready` notification on the
**existing** `notifications` table) with its checker, then MIS-164 (FE — sign-off summary
screen with the summary above the confirm action, the real "waiting on your sign-off" list
on the supervisor home, and `No phase plan · not gated` on order detail per D10) only once
163's checker returns PASS.

**Nothing in this migration has been executed anywhere** — there is no local Postgres on
this machine, so the SQL is unvalidated against a server. If `db:deploy` rejects it, hand
the error back rather than patching around it.

## What was built (Half B — MIS-163 then MIS-164, phase complete)

**MIS-163 (BE)** — checker passed before MIS-164 started.
- `src/server/mis/job-phases.ts` — **new**. One `TRANSITIONS` table (Appendix A §A.3) and
  `JobPhaseError` with a `reason` code per refusal. `startPhase`, `signOffPhase`,
  `markNotApplicable`, `restorePhase`, `reopenPhase`, `reassignInCharge`,
  `acknowledgeQcFailure`, `setWasteReason`, `getSignOffSummary`, `getSignOffBlockers`,
  `listPhasesAwaitingMySignOff`, `planPhases`, `ensureBprProcesses`,
  `resolveJobPhaseForProduction`. Every refusal names the blocking phase *and* its
  in-charge (MIS-146).
- `src/lib/mis/bpr-workflow.ts` — **new**, pure: the eleven work-flow processes in the
  client's printed order.
- `src/lib/mis/permissions.ts` — `phase.read` (+QC), `phase.write`, `phase.reopen` (Owner).
- `src/server/notifications/index.ts` — `mis.phase_ready` on the **existing** table.
  Written inside the sign-off transaction, so it cannot fire on a rollback.
- `src/server/mis/production.ts` — the third gate, after the D7 clearance check.

**MIS-164 (FE)**
- `src/components/mis/production/sign-off-screen.tsx` + route
  `/mis/production/sign-off/[phaseId]` — summary above the confirm action, always; inline
  cards clear each blocker (waste reason, QC acknowledgement) without leaving the screen.
- `src/components/mis/home/supervisor-home.tsx` + `src/app/(mis)/mis/page.tsx` — the
  "waiting on your sign-off" card now lists **real phases**. It previously listed
  attendance clock-out approvals, the same slot-reuse Phase 6 found on the amber card.
- `src/components/mis/orders/order-detail-screen.tsx` — the phase list, or
  `No phase plan · not gated` (D10). `getPhasesForOrder` is deliberately **not**
  `.catch()`-ed to `[]` there like its neighbours: a swallowed error would render that
  label and claim a gate is absent when it may not be.
- `src/lib/mis/i18n/dictionaries.ts` — 28 `phase.*` keys, English and Hindi.

**Tests.** `job-phases.test.ts` — 61. `job-phases.gate.db.test.ts` — 9 **against the real
database**: one transaction, a SAVEPOINT per test, rolled back in `afterAll`, writing
nothing (verified: zero rows left behind). It proves the trigger rejects an out-of-sequence
start *and* a direct `INSERT` that arrives already running, that a skipped phase does not
block, that REOPENED does block, and that the CHECK constraints reject a signature with no
signer. `describe.skipIf` skips the file with no `DIRECT_URL`.

**Verify:** `tsc --noEmit --skipLibCheck` silent · `pnpm vitest run` **519/519** ·
`pnpm build` clean, route `/mis/production/sign-off/[phaseId]` present.

**Known, not ours:** eslint on `orders/[id]/page.tsx` and `order-detail-screen.tsx` reports
7 pre-existing `no-explicit-any` errors and 2 unused-arg warnings that predate this phase.
Not touched — typing those shapes is a refactor, not this ticket.

## Decisions cited (addition)
**D7/D8** — the three gates stay independent; `job-phases.ts` never imports
`assertLineCleared` (the only mention in it is the comment saying why). **D9–D12** as
designed in Half A. **New: D13** — orders carry no quantity column, so a phase's output is
read against what the previous phase handed over, which is what the client's own form does.

## What changed for later phases (addition)
- **Phase 11** stamped — re-resolve the phase at replay, never at queue time; park on
  `NO_ACTIVE_PHASE`/`AMBIGUOUS_ACTIVE_PHASE`; **retire** on `ALREADY_IN_STATE`.
- **Phase 17** stamped — module renamed in its Touches list; 70 tests already exist to
  extend rather than duplicate; what is still owed is one test per illegal transition in
  Appendix A §A.3, plus MIS-162's fixture against D13's denominator.

## Pending — the next agent must do this first (supersedes Half A's note)
Nothing for Phase 7. Five questions for Arjun sit in `DECISIONS.md` (D9–D13), none
blocking; **D9 is the one to ask first** — if one order can run two job cards at once,
phase state keyed on `orderId` collapses them, and D9 scopes that fix in advance.

**Not wired, deliberately:** `planPhases()` and `ensureBprProcesses()` are built, gated and
tested but have no screen — no ticket in this phase asked for a planning UI, and the BPR
work-flow tick-boxes are an order-entry surface (E5). Until a planner exists, every order
has zero phases and is therefore ungated-and-labelled by D10. **A phase that builds the
job-card planning screen should call these two rather than inserting rows itself** — a
direct insert now meets a trigger and four CHECK constraints (`MIS_UI_SPEC.md` §7.1).

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-07.md
