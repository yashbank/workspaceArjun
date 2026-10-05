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
**Status:** DONE (PR #54, 2026-10-04)
Re-checked all 9 E6 sub-areas against current code rather than trusting the stale (2026-09-15)
TICKET_INVENTORY.md verdict. Almost everything was already built and tested in commits dated
2026-09-19 through 2026-09-27, after that inventory ran: E6-01 phase model/state machine
(`server/mis/job-phases.ts`, matches DEVELOPMENT_GUIDE.md Appendix A exactly, 64 tests),
E6-02 line clearance (`line-clearance.ts`, 12 tests), E6-03 production entry (already YES),
E6-04 offline production + idempotent sync (`idempotency.ts`, `queue-resolve.ts` parked-writes
inbox, `submit-production.ts`), E6-05 material consumption/traceability (`traceability-view.ts`,
31 tests), E6-06 wastage roll-up (already YES, `getWastageReport` in `reports.ts`), E6-07 phase
sign-off/handover gate (`signOffPhase()`, the sign-off screen, Supervisor home), E6-08 live
order status board (already YES) were all confirmed DONE with no further work needed. The one
genuine remaining gap was E6-09 (BPR print): `/mis/print/job-card/[id]` rendered BOM stages and
three generic blank signature boxes with no connection to the real per-phase sign-off machine.
Fixed: added a "Work Flow — Section Sign-Off" table from `getPhasesForOrder()` (status,
in-charge, started/signed-off timestamps, signature line, the client's own hand-off rule text,
and the D10 "No phase plan · not gated" message for ungated orders). `mis_job_phases` still has
0 live rows in production — that is a usage/exercise gap, not a code gap; every path is built
and tested (job-phases.gate.db.test.ts exercises the live DB trigger directly).

## Track 2 — E7: Quality, COA, Documents & Reports
**Status:** DONE (PR #56, 2026-10-05) — re-checked every E7 ticket against current code (most of
the 2026-09-15 inventory's 14 NO/17 PARTIAL was already closed by Phase 24E/18, not re-verified
since): AQL engine (E7-04), the QC home board/grid/defect-type master/line-clearance blocker
(E7-02/E6-02, already fully wired into `supervisor-home.tsx`), document storage, traceability,
attendance summary and the owner dashboard alerts (E7-09/10/12/13) were all genuinely done. Fixed
what was still genuinely broken, all within QC/documents/reports files only:
- **E7-03 (defect logging + notification):** the "Add QC Check" FAIL flow (`qc-screen.tsx`,
  `qc-detail-screen.tsx`, `qc-grid-screen.tsx`) took the defect type as free text, never touching
  `mis_defect_types` — only the separate "Run AQL Sample" flow used the master (F-19). Now a
  `<Select>` sourced from `listDefectTypes()`, with a "not listed" free-text fallback since QC
  holds `masters.read` only. A FAIL check or a rejected AQL sample now fans a `mis.qc_defect`
  notification out to every active SUPERVISOR (`server/notifications`), the same table
  `job-phases.ts`'s sign-off handover already uses.
- **F-18/F-34 (QC home timezone bug):** `getTodayQcBoard` used the server's own clock
  (`getHours`/`setHours`) to decide "today" and "which hour", not the factory's zone — fixed to
  match `getQcHourlyGrid`'s existing discipline (D22).
- **F-39/MIS-267 (attendance report bug):** `getAttendanceReport`'s present/late counts disagreed
  with `payroll.ts`/`attendance.ts`'s own definitions (dropped HALF_DAY from "present", missed a
  PRESENT day with real `lateMinutes` from "late") — fixed, `it.fails` markers flipped to passing.
- **E7-07 (COA print, new bug found):** the Certificate of Analysis print page read
  `checkedAt`/`checkedBy`/`defectDescription` — fields that don't exist on a QC row (the real
  names are `checkTime`/`checkBy`/`defectType`+`notes`) — so every printed COA showed "Invalid
  Date" and blank Checked-By/Notes regardless of what was recorded. Fixed.
- **F-23(8)/(9) (document link safety):** the phone documents screen turned any pasted string
  straight into an `href` (unlike the desktop library's `safeHref`, D31) — fixed. `addDocument`/
  `deleteDocument` wrote the document's `filePath` into the audit payload, which can carry a
  signed URL's token and is Admin-readable — now withheld.
- **E7-11 (machine utilisation, new):** built `getMachineUtilisationReport` + a "Machines" tab on
  `/mis/reports`, unblocked by Phase 9's `jobPhaseId` wiring on `MisMachineAllocation`. Honest
  about what it counts: booked time against wall-clock time in the range, never a downtime claim
  (`MisMachine` carries no history of when it went down, F-14).
Explicitly NOT built, flagged rather than guessed: **E7-01** (configurable checklist templates —
no master exists at all, F-20, and no product decision on what the templates/items even are) and
**E7-08** (document versioning/categories/retention — D31 already records this as an open
"Ask Arjun" question, SCHEMA GATE Half A, not something to invent here). `mis_defect_types` and
`mis_line_clearances` still show 0 live rows — that remains a usage/exercise gap (nobody has
added a defect type or cleared a line yet), not a code gap; every path is now built and tested.
`tsc --noEmit --skipLibCheck` silent, `pnpm test` 216 files / 4423 passed (includes 7 new test
files this track added), `pnpm build` succeeds, every `/mis/*` route present.

## Track 3 — E1: Foundation & Access Control gaps
**Status:** DONE (PR #53, 2026-10-04) — all 16 "NO" tickets were already built (landed
Phases 1-3 and 14/14F, after the 2026-09-15 inventory snapshot); only a stray eslint error
(unescaped apostrophe) in the wage-type screen needed fixing.
All 16 re-checked against current code, not against the stale inventory: E1-06 wage types
(`src/server/mis/wage-type.ts` + `src/app/(mis)/mis/settings/wages/` — full Owner-only create/
add-rate/activate-deactivate admin UI, `mis_wage_types`' 5 rows are real seeded codes, not a stub),
E1-07 pool visibility resolver (`src/server/mis/visibility.ts`, D4, with scoped pickers + honest
empty states on the employee screen), E1-08 user management/invites (`src/server/mis/users.ts` +
`src/app/(mis)/mis/settings/users/` — Owner invites/grants, Admin view-only, reuses the workspace's
own seat-limited invite pipeline) are genuinely implemented and permission-gated. The four QA-only
NO tickets (MIS-34 role-resolution, MIS-40 nav/toggle-persistence, MIS-43 employee full-slice,
MIS-272 "a rule change never moves a closed month") were closed by Phase 14/14F and are covered by
`roles.test.ts`, `navigation.test.ts`/`navigation-more.test.ts`/`lang-toggle.test.tsx`,
`employee.test.ts`/`employee-slice.test.ts`, and `rule-history.test.ts`'s F-08 block respectively.
Verified: every forbidden-role case is asserted (not just the happy path) in `wage-type.test.ts`,
`wage-leak.test.ts`, `users.test.ts`, `users-lifecycle.test.ts`, `visibility.test.ts`,
`visibility-lists.test.ts`; swept `logAuditEvent` call sites by hand for wage/rate/amount/salary/₹
keys — the one hit (`store.ts`'s `pricePerUnit` before/after) is caught by `audit.ts`'s own
`redact()` (`MONEY_FIELDS`), so it never reaches the stored row. No wage/salary figure is fetched
on any non-OWNER code path. `tsc --noEmit --skipLibCheck` silent, `pnpm test` 206 files / 4310
passed (unchanged), `pnpm build` succeeds, every `/mis/*` route present.

## Track 4 — E5: Orders, BOM & Job Cards gaps
**Status:** DONE (PR #55, 2026-10-05) — Part A: fixed order/PO numbering races (MIS-111, F-38) and
the BOM approval gate (MIS-123, F-37: `approveBom`/`submitBomForApproval` now check status);
confirmed E5-04 (BOM costing/owner-gate) and MIS-114/120 (BOM tree integrity/money isolation)
already done; BOM versioning schema prepared in `prisma/migrations-pending/` (not yet wired —
needs a human `pnpm db:deploy` first); added order-detail "Documents" tab (E5-09) reusing the
existing document-library module; E5-06 (job card template builder) and the rest of E5-09 flagged
as blocked on the parallel E7/Documents track, not built. Part B: found and fixed a real bug —
`createPO` never wrote the `purpose` column (Phase 21's `mis_purchase_orders_purpose_bom_ref_ck`),
so every buffer-stock PO raised since that migration would have been rejected by Postgres in
production; every spec-listed surface (list, detail, print, approval queue, receive chip) was
already correctly deriving via `poPurpose()`. See PR for full detail.

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

## Kiosk alignment check (2026-10-05, ad hoc — not a numbered track)
**Status:** DONE, no code change needed
Android kiosk team's `docs/KIOSK_ALIGNMENT_2026-10-05.md` asked for two things to be verified:
1. **`operatorId` surfaced on the dashboard** — confirmed still intact after all Track 1-5 merges
   (`listPunchesForDay` in `attendance.ts` resolves it to `operatorName`, shown in the attendance
   screen's "Punches" slide-over, added by the earlier PR #51).
2. **`/punch` idempotency dedup under concurrent same-key requests** — read `src/server/mis/
   idempotency.ts` end to end. Confirmed airtight: `MisQueuedWrite.key` is a DB-level primary key
   (`@id` in schema.prisma), the claim is taken inside the same transaction as the business write
   (create-or-conditional-update, never `upsert` — Phase 10's upsert bug is exactly what this
   replaced), and a losing concurrent attempt is caught via `LostRace`/Postgres `P2002` and
   answered with the winner's own result. `idempotency.test.ts` has a dedicated test simulating
   the exact "both attempts read the key as absent" race and asserts only one business row ever
   commits. No change needed.

**Open, needs your decision, not an engineering gap:** the kiosk can't build a Super Attendance
Operator distinction because `/pull`'s roster response has no role field at all (`PULL_EMPLOYEE_KEYS`
only selects `id, name, badgeCode, shift`). Deliberately left unbuilt until you decide whether to
extend that API contract — flag to the user if wanted.

## Track 6 — Desktop responsive pass + full regression (no epic, cross-cutting)
Split into two independent halves once Tracks 1–5 all landed, so two agents could run them in
parallel without stepping on each other.

### Track 6a — Code-level regression gate + eslint cleanup
**Status:** DONE (PR #57, 2026-10-05)
Ran after all 5 tracks (PRs #52-56) merged into `phase-a`. Pure verification + cleanup, no new
features, no schema changes:
- `pnpm install && pnpm db:generate` clean; `node_modules/.bin/tsc --noEmit --skipLibCheck` silent,
  no grep filter.
- `pnpm lint` across the whole repo: 74 problems (60 errors / 14 warnings, left behind by the 5
  parallel tracks in files outside each one's own scope — Production/Orders/Reports/Store/
  Traceability/Suppliers) fixed down to 6 errors. Fixed: ~50 `no-explicit-any` call sites in
  page→screen prop-passing by using each server module's own exported Input/return type instead of
  `any` (or just letting TS infer from the already-typed Prisma result); two real type-looseness
  spots tsc caught once the `any` stopped hiding them — `orders/[id]/page.tsx`'s `productionLogs`
  now converts Decimal `qtyProduced`/`qtyWaste` to `Number()` server-side instead of casting the
  array, and `employee-screen.tsx`'s role field now goes through the existing `isMisRole` guard
  instead of a bare `string`; ~12 unused-var/import warnings (dead props like `shifts`/
  `canSeeWages`/`canWrite` threaded through but never read — verified none of them touch money
  gating, which already runs through `isOwner`/`wages.read` at every site that shows rupees); two
  static `<a href="/mis/...">` back-links converted to `next/link`. Left deliberately unfixed and
  flagged rather than guessed: 6 `type Row = Record<string, any>` mock-Prisma plumbing declarations
  in test files (bom.test.ts, orders-numbering.test.ts, po-buffer-stock.test.ts,
  qc-aql-decisions.test.ts, reports-buffer-drift.test.ts, api/mis/inventory/import/route.test.ts) —
  a real type here is a test-infra design decision (a typed mock Prisma client), not a one-line fix.
- `pnpm test`: 216 files / 4423 tests passing — matches the pre-merge baseline exactly, no
  regressions.
- `pnpm build`: succeeds; confirmed every route from all 5 tracks is present (`/mis/print/job-card/
  [id]`, `/mis/qc/defects`, `/mis/settings/wages`, `/mis/settings/users`, `/mis/crew`,
  `/mis/orders/[id]`, `/mis/reports`, etc.).
- Integration spot-checks across the 5 independently-developed branches: no merge-conflict markers
  anywhere; `permission-matrix.test.ts` (the function-level door-coverage test) passes clean, 404
  assertions, already accounts for new E7 exports like `getMachineUtilisationReport`; no duplicate
  exported function names across `src/server/mis/*` or `src/lib/mis/*`; `prisma validate` clean and
  confirmed Track 4's reverted BOM-versioning schema edit left no half-applied trace in
  `schema.prisma` (the migration SQL is still correctly parked, unapplied, in
  `prisma/migrations-pending/`). One pre-existing (predates all 5 tracks, both from Phase 24E, not
  something this merge introduced) minor duplication found and left alone: `normaliseQuery` is
  defined identically in both `lib/mis/document-library.ts` and `lib/mis/trace.ts`.

### Track 6b — Desktop responsive pass + visual regression
**Status:** DONE (2026-10-05, no PR number yet — see branch `track6b-visual-qa`)
Real browser, real DB: `pnpm dev` against the connected Supabase project, driven headless via
Playwright's own Chromium (already a project dependency — no new tool added) logged in as the
documented `E2E_OWNER_EMAIL` test account (`e2e-owner@bhaskarpaper.test`, `.env.e2e` — OWNER's nav
reaches every screen in scope, confirmed against `e2e/roles.ts`'s `EXPECTED_NAV`). Screenshotted
every Track 1–5 screen named in this track's brief at 390px and 1280px: `/mis/print/job-card/[id]`,
`/mis/qc`, `/mis/qc/defects`, `/mis/qc/grid`, `/mis/print/coa/[id]`, `/mis/reports` (both the
default tab and the new Machines tab), `/mis/documents` (including with an order selected, to
exercise the F-23 `safeHref` fix), `/mis/settings/wages`, `/mis/settings/users`, `/mis/orders/[id]`
(both Overview and the new Documents tab), `/mis/crew`. Checked each for horizontal overflow
(`scrollWidth` vs `innerWidth`), console/page errors, and eyeballed every screenshot.

Found and fixed three real phone-width (390px) overflow bugs, all in screens this effort's own
tracks touched:
- **`reports-screen.tsx` tab bar** — Track 2's new "Machines" tab (E7-11) made it six non-wrapping,
  non-scrolling tabs in a plain `flex` row; the row itself (595px) blew the page 205px past a 390px
  viewport. Fixed: `overflow-x-auto scrollbar-none` on the row, `shrink-0 whitespace-nowrap` on each
  pill (matches the `scrollbar-none` utility already in `globals.css`, reused rather than inventing
  a new one).
- **`reports-screen.tsx` header row** — separately, the month prev/next + CSV/Print controls (5
  items, one with a `min-w-[120px]` label) don't fit a 390px row either; a smaller, pre-existing
  overflow the 6-tab bug was masking. Fixed: `flex-wrap` on the controls row.
- **`order-detail-screen.tsx` tab bar** — same shape of bug: Track 4's new "Documents (N)" tab,
  whose label grows with the count, pushed five tabs past 390px. Same fix (`overflow-x-auto
  scrollbar-none` / `shrink-0 whitespace-nowrap`).
- **Print sheets, defensive fix, not confirmed with real data:** `/mis/print/coa/[id]`'s 5-column
  QC table overflowed 20px at 390px with real data (an order with 8 real QC checks) — wrapped in
  `overflow-x-auto` (print output unaffected, `@page { size: A4 }` is a separate media query).
  `/mis/print/job-card/[id]`'s new 7-column BPR sign-off table (Track 1, E6-09) got the identical
  wrap pre-emptively: `mis_job_phases` has 0 live rows (tracker-wide, noted above), so no order in
  the DB could exercise it with real phase rows — every order tested rendered the "No phase plan ·
  not gated" fallback instead of the table. The table is structurally the same shape as the COA
  one that did overflow (more columns, same lack of `overflow-x-auto`), so the fix was applied on
  that reasoning rather than left unverified; flagging here that it is *reasoned*, not *witnessed*.

Confirmed working, no fix needed: COA print now shows real dates and `checkBy` names (Track 2's
field-name fix, `15/9/2026` / `Arjun` rather than "Invalid Date" / blank) — verified against a real
order with 8 QC checks. The phone Documents screen's `safeHref` fix (F-23) renders correctly with a
real document selected ("Link not safe to open" for a non-http `filePath`, matching the desktop
library's own warning for the same row). `/mis/settings/wages` and `/mis/settings/users` (Track 3)
render cleanly at both widths. `/mis/crew` (Track 5) still renders cleanly at both widths, no
desktop-specific twin needed (same component tree, CSS-only, per MIS_UI_SPEC §3). `/mis/qc`,
`/mis/qc/grid` clean at both widths.

**Not a bug, a documented design split — initially mis-read as two page errors in this session's
own screenshot script:** `/mis/reports` and `/mis/orders/[id]` each render a genuinely different
component at >=1024px (`WastageDesktop` / D7, `OrderDetailDesktop` / D4) than the phone-width tabbed
screen this track's fixes targeted — `?view=classic` is the documented escape hatch back to the
tabbed version at any width (see the pages' own code comments). `/mis/qc/defects` below 1024px
intentionally has no phone twin and falls back to the `/mis/qc` board (also code-commented);
confirmed this is what a phone visiting `/mis/qc/defects` actually shows, not a routing bug.
**Flagging, not fixing (product decision, not a CSS bug):** the new Machines tab (E7-11) has no
equivalent on the >=1024px `WastageDesktop` (D7) — `wastage-desktop.tsx`'s own comment ("Machine
utilisation is not a report yet, so its tab is absent rather than dead") now reads as stale. A
desktop user only reaches it via `/mis/reports?view=classic`, same as the pre-existing tabbed
report. Same shape of gap on `order-detail-desktop.tsx` is NOT present — D4 already has its own
"Documents" card (count + list + link to `/mis/documents`), so Track 4's new phone tab needed no
desktop counterpart.

One pre-existing, unrelated bug noticed along the way and NOT fixed (out of this track's scope —
not width-dependent, not specific to any of the 5 tracks' screens, affects the shared `Select` kit
component everywhere a caller supplies its own placeholder option): `components/mis/kit/select.tsx`
always renders its own hardcoded `<option value="" disabled>{placeholder ?? t('role.select')}</option>`
("Select a role") ahead of the caller's options — on `/mis/documents`' order filter (which passes
its own `— Select Order —` placeholder as `options[0]`), the open dropdown shows a redundant,
mistranslated "Select a role" entry above the real placeholder. Cosmetic, not a layout bug, not
scoped to Tracks 1–5 — flagging for a future ticket rather than touching a shared kit file here.

Verification: `node_modules/.bin/tsc --noEmit --skipLibCheck` silent; `pnpm vitest run` 217 files /
4432 passed (unchanged + one test file updated, see below), `pnpm build` succeeds, every `/mis/*`
route present. One existing test had to be edited, not weakened: `tap-targets.test.ts` asserted an
exact, frozen class-order literal (`inline-flex min-h-11 items-center px-4 text-sm font-medium
border-b-2`) against the two tab bars above; the fix legitimately adds `shrink-0 whitespace-nowrap`
and reorders nothing load-bearing, so the literal no longer matched even though the actual invariant
the test exists for (`min-h-11`, 44px tap targets) still holds. Rewrote those two assertions to use
the file's own `tagAround()` helper against the tab button's own tag (consistent with every other
assertion in the same file) instead of a whole-file frozen-order literal.

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
