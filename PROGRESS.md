# PROGRESS — R2 Round 5 (single source of truth across Claude accounts/sessions)

**Rule for every session (any account):** read this file FIRST. Do only rows marked `TODO`. Never redo a `DONE` row.
Claim a row by setting `IN_PROGRESS <account> <date>` and pushing before you start; set `DONE <sha>` and push the moment it is finished.
One row in progress per session. Never mark Pass in the tester sheet. If a row is `BLOCKED`, say why here and stop.

Branch: `fix/r2-round5` (from `main` @ a794727 = tester build). PR to `main` only when all gates green.
Details per ticket: `docs/qa/R2_ROUND5_TRIAGE.md` (plan) · `HANDOFF.md` (context, gotchas) · tester sheet "MIS Testing R2-V2" (Drive, Bugs tab; R2-xxx are ticket IDs, not rows).

| # | Task | Status |
|---|---|---|
| 0 | Phase 0 triage → `docs/qa/R2_ROUND5_TRIAGE.md` | DONE (commit on Mac-1, local only until pushed) |
| 0a | Push `fix/r2-round5` from Mac-1 (`git push -u origin fix/r2-round5`) | DONE 1a87908 (already on origin) |
| 0b | Full test suite baseline run, results recorded below (no code changes) | DONE 88d7749 |
| 0c | Commit `HANDOFF.md` + `PROGRESS.md` + CLAUDE.md pointer, push | DONE 1a87908 |
| 1A | Batch A attendance/payroll: 161, 163, 165, 166, 167 (half-day leave), 168, 169, 170, 171, 172, 175 (reopen, conditional), 184 | DONE bb8593d |
| 1B | Batch B BOM list + search UX: 124–126, 138–142, 146, 147, 151 (clamp), 152 | DONE 02579f9 |
| 1C | Batch C documents: 155 (owner: self-approve allowed), 156–160 (158 = write VOID migration, do NOT apply; 160 = inline alert, never print corrupt copy) | DONE 9f64373 |
| 1D | Batch D store/orders integrity 185–196: mostly ALREADY_FIXED → characterization tests only | IN_PROGRESS pravin 2026-10-28 |
| 1E | Batch E employees/kiosk/APK 177–182 (177 unsigned release build; 181 accept pull-based revoke; 182 no photo capture, no code) | TODO |
| 1F | Batch F test health 197–209: `.gitattributes` `* text=auto eol=lf`, wage-rule-keys timeout, store-tap-targets `\r?\n`. Do not weaken assertions | TODO |
| 1G | R2-173 shift/overtime/auto clock-out/busy carry-over (after 1A) | TODO |
| 1H | R2-179 paid lunch break punches, duration in Owner settings (after 1F) | TODO |
| 2 | P2 gates: unit → full suite+typecheck+lint+build → browser pass per role → independent verifier on sheet Steps | TODO |
| 3 | P3: PR + merge, confirm Vercel Ready for SHA, update tracker xlsx + `docs/qa/R2_ROUND5_RESULTS.md`, tester message (sheet rows → "Fixed - Ready to Retest" + notes + release + SHA), ≤15-line report | TODO |

## Owner decisions
- R2-155: Owner MAY approve a version they prepared — no second person required. **DECIDED**
- **FINAL owner decisions (2026-10-28, supersede any earlier default):**
  - 167 half-day leave: BUILD. Attendance Operator raises request; Owner OR Admin (either) approves; then 0.5 day applied to that employee (attendance + pay, correct calculation).
  - 173 shifts: BUILD as own batch 1G after 1A. Shift dropdown also at clock-out (prefilled); worker who stays past shift end: auto clock-out of shift 1, time beyond counts as overtime; if still on a task show busy in next shift, else back in available pool.
  - 175 reopen closed month: BUILD for Owner with mandatory reason, ONLY if it reflects correctly in widgets/payroll/exports with no errors; if any issue arises, DEFER.
  - 179 break punches: build LATER (row 1H). Lunch is PAID; duration set in Owner settings. Record break without overwriting morning punch; net hours/OT correct.
  - 181 accept pull-based revoke. 182 NO photo capture; employee photos set by Admin/Owner in portal, operator sees the right photo on each punch (already shown from roster).
  - 177 unsigned release APK from HEAD, report path. 158 VOID migration: write, do not apply. 160 inline alert, never print corrupt copy.
- Earlier: 24h time by design (164). Page size 10 (`src/lib/mis/pagination.ts`); `R2_DECISIONS.md` R2-83 "25" is stale.

## Baseline test results (fill at 0b)
- typecheck: green (Mac-1, 2026-10-27) · lint: not finished · Mac-1 mid-run: 4 slow-machine timeouts (`wage-screens`, `r2-qc-corrections`, `r3-mst-import`, `permission-matrix`).
- **0b run 2026-10-28 (pravin, branch @ 8340dd0, `pnpm test`, 118.9 s):** Test Files 5 failed | 373 passed | 1 skipped (379) · Tests 6437 passed | 5 expected fail | 9 skipped (6451).
- All 5 failed files are import-time `ENOSPC: no space left on device` (vitest temp dir; disk at 177 MB free), not assertion failures — their tests never ran:
  `src/server/mis/r3-stk-grn.test.ts`, `src/server/mis/r3-stk-store.test.ts`, `src/server/mis/r3-wrk-engine.test.ts`, `src/server/mis/traceability-view.test.ts`, `src/components/mis/desktop/attendance-month-desktop.test.tsx`.
- The 4 Mac-1 timeout files passed this run. Rerun those 5 after freeing disk to get a clean baseline.
- **Rerun 2026-10-28 (pravin, 13 GB free):** those 5 files → Test Files 5 passed (5) · Tests 164 passed (164). Baseline: 378/379 files pass (1 skipped), 0 real failures.

## Log (newest first, one line each: date · account · what · sha)
- 2026-10-28 · mac1 · 1C done: 155-160. Full suite 393 files green. Migration 20261028000000_r2_doc_version_void APPLIED + promoted. · 9f64373
- 2026-10-28 · mac1 · 1B done: 124-126,138,140-142,146,147,151,152,(153 test); 139 PARTIAL (due date added; qty/unit DEFERRED: MisOrder has no such columns, needs schema change). Half-day leave now follows Leave-pay setting (default Unpaid; Paid = 1.0 day, Unpaid = 0.5). Full suite 392 files green after 2 fixes. No migration · 02579f9
- 2026-10-28 · mac1 · 1A done: 161,163,165-172,175,184 (all 12). Full suite 387 files green after 2 test-contract fixes (rule-history it.fails flipped for 161; server-gates reviewed entry for getMyAttendanceMonth). Migration 20261028000000_r2_half_day_leave APPLIED and promoted to prisma/migrations. Half-day pay flat 0.5, ignores paid/unpaid leave setting · bb8593d
- 2026-10-28 · pravin · 0b baseline: 373/379 files, 6437 tests pass; 5 files ENOSPC (disk full), rerun needed · 88d7749
- 2026-10-28 · pravin · 0a verified: origin/fix/r2-round5 = 1a87908, nothing to push · 1a87908
- 2026-10-27 · Mac-1 · Phase 0 triage done, HANDOFF.md written, session limit hit before commit/push · (unpushed)
