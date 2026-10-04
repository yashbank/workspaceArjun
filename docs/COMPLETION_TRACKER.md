# Completion Tracker — path to 100%, zero known bugs, then hand off to QA

**Read this file first in any new session.** It is the resumable state for this effort — if a
session ends mid-track, the next one reads the status column below and continues that exact
track; it does not re-derive scope from scratch. Update the status cell the moment a track
starts/finishes, not just at the end of a session.

**Scope note:** functional/UX testing is NOT part of this tracker — that is delegated to an
external tester (`docs/qa/EXTERNAL_TESTER_GUIDE.md`). This tracker's job is: make every epic's
code match its ticket's intent, pass `tsc`/eslint/tests/build, and deploy — "zero known runtime
bugs" at the code-gate level, not "verified correct by a human" (that's the next phase).

Evidence base: `docs/TICKET_INVENTORY.md` (294-ticket build-vs-Jira cross-check, generated
2026-09-15 — **3 weeks stale, Track 0 refreshes it**) + live DB row counts taken 2026-10-04
(`mis_job_phases`, `mis_payroll_periods`, `mis_payroll_snapshot_lines`, `mis_defect_types`,
`mis_line_clearances`, `mis_worker_allocations`, `mis_extra_pay_days*` all at 0 rows — built
code, zero real exercise).

## Status legend
`TODO` · `IN_PROGRESS (agent/session, started <date>)` · `BLOCKED (reason)` · `DONE (PR #, date)`

---

## Track 0 — Refresh the ticket inventory (do this first, ~30–60 min)
**Status:** TODO
Re-verify `docs/TICKET_INVENTORY.md`'s NO/PARTIAL verdicts for epics E1, E4, E5, E6, E7 only
(E2/E3/E8/E9 are current — E3 attendance/kiosk was this session's own focus). Output: an updated
short punch list per epic, replacing guesswork. Do NOT re-read the 294-ticket file into a human's
chat context — one agent does this and writes the refreshed list back into this section.

## Track 1 — E6: Production & Wastage / BPR sign-off spine
**Status:** TODO
`mis_job_phases` has 0 live rows despite the phase-gate trigger + `server/mis/job-phases.ts`
being built (Phase 7) — the BPR sequential sign-off flow has never run end-to-end. Per
TICKET_INVENTORY.md (2026-09-15): 18 NO, 8 PARTIAL, highest remaining-work score of all epics.
Fix scope: whatever NO/PARTIAL items Track 0 confirms still stand, built against
`docs/DEVELOPMENT_GUIDE.md` Appendix A (full phase transition table) and MIS_UI_SPEC §7.1.

## Track 2 — E7: Quality, COA, Documents & Reports
**Status:** TODO
`mis_defect_types` and `mis_line_clearances`: 0 rows — QC defect master and the Supervisor-home
line-clearance blocker card are unexercised. Per inventory: 14 NO, 17 PARTIAL (second-highest
score). Covers QC grid, defects, COA print, documents, reports screens.

## Track 3 — E1: Foundation & Access Control gaps
**Status:** TODO
Inventory calls out, with no code found at all: E1-06 (wage types admin UI — note
`mis_wage_types` has 5 rows so *data* exists, the management screen may not), E1-07 (pool
visibility resolver), E1-08 (MIS user management/invites). 16 NO total for this epic. Confirm via
Track 0 before building — these may have landed since Sept 15.

## Track 4 — E5: Orders, BOM & Job Cards gaps
**Status:** TODO
9 NO, 12 PARTIAL. Also re-verify the client's Sep-2026 PO-purpose change (buffer-stock vs
for-order, MIS_UI_SPEC §6) is fully wired across every surface listed there (list column, detail
card, printed PO, approval queue row, receive screen chip) — built once, not re-checked since.

## Track 5 — E4: Worker allocation engine
**Status:** DONE (PR #52, 2026-10-04) — already complete, no code change needed
`mis_worker_allocations`: 0 rows, but the table (and all surrounding code) is fully built —
the Sept 15 inventory's "no trace in schema or server code" is stale. It landed in commit
`d7a8411` ("MIS phases 1-14F"), already on `phase-a`/`origin/phase-a`, well before this check:
schema (`MisWorkerAllocation`, `prisma/migrations/20260921000000_mis_worker_allocations/`,
confirmed live on Supabase via read-only `execute_sql` — table exists with the exact columns
the migration describes), server (`src/server/mis/worker-allocation.ts` — `assignWorkers`,
`releaseWorker`, `getWorkerAvailability`, `getCrewSummary`, each behind `requirePermission`
and audited via `logAuditEvent`, pool-scoped through `resolveVisibleEmployeeWhere`, with the
MIS-262 "warn not refuse" overlap rule and the MIS-265 job-phase/order cross-check), tests
(`worker-allocation.test.ts`, 30 cases, all passing), UI (`/mis/crew` page + slide-over crew
assignment, wired into the SUPERVISOR bottom nav and i18n in English+Hindi), and the home-screen
wiring the ticket asked for (`getCrewSummary()` → `SupervisorHome`'s "My crew today" card in
`src/app/(mis)/mis/page.tsx` / `supervisor-home.tsx`). Zero rows simply means no supervisor has
used it yet in the live data, not that it's unbuilt. Verified clean: `tsc --noEmit --skipLibCheck`
silent, `eslint` clean on the feature files, `pnpm test` 4310 passed, `pnpm build` green. Not
verified: a printed job card showing assigned crew (MIS-261's "wire to job cards" may partly mean
this) — left alone since `print/job-card` is Production-owned territory for this track's scope,
and the explicit ask (allocate → reflected in home crew count) was already satisfied end to end.

## Track 6 — Desktop responsive pass + full regression (no epic, cross-cutting)
**Status:** TODO
Desktop components exist (`src/components/mis/desktop/*`, confirmed present 2026-10-04) but have
not been visually load-tested. Check the 1024px/1280px breakpoints from MIS_UI_SPEC §3/§9 render
correctly for every screen touched by Tracks 1–5, plus a full regression of the already-solid
modules (attendance/kiosk, store/inventory, masters) to confirm nothing in Tracks 1–5 broke them.

## Track 7 — Deploy + Jira dev-ticket status flip
**Status:** TODO — gated on Tracks 0–6 all DONE
Merge everything to `main`, confirm Vercel production deploy is green, then flip the Jira status
on tickets Tracks 0–6 actually closed (not a full resync — that happens after the external
tester's report, see below). Hand `docs/qa/EXTERNAL_TESTER_GUIDE.md` to the tester.

## Track 8 — Post-testing (future, not started)
**Status:** TODO — gated on tester's report + your own manual spot-check
Full Jira resync against final reality, then the per-role/per-screen documentation pass with
screenshots.

---

## How to resume after a session/limit cutoff
1. Read this file top to bottom — the status column is ground truth, not memory.
2. Pick the first `TODO` or `IN_PROGRESS` track in order (0 → 8); tracks are mostly independent
   of each other EXCEPT Track 6 (regression) must run after whichever of 1–5 it's checking, and
   Track 7 is gated on 0–6.
3. Before writing code, re-run: `node_modules/.bin/tsc --noEmit --skipLibCheck` (must already be
   silent) so you know your starting point is clean.
4. On finishing a track: update its status line here with the PR number and date, in the same
   commit/PR if possible, so the tracker and the code never drift apart.
