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
| 1A | Batch A attendance/payroll: 161, 163, 165, 166, 168, 169, 170, 171, 172, 184 | TODO |
| 1B | Batch B BOM list + search UX: 124–126, 138–142, 146, 147, 151 (clamp), 152 | TODO |
| 1C | Batch C documents: 155 (owner: self-approve allowed), 156–160 (158 = write VOID migration, do NOT apply; 160 = inline alert, never print corrupt copy) | TODO |
| 1D | Batch D store/orders integrity 185–196: mostly ALREADY_FIXED → characterization tests only | TODO |
| 1E | Batch E employees/kiosk/APK 177–182 (177 unsigned release build; 181 accept pull-based revoke; 182 defer) | TODO |
| 1F | Batch F test health 197–209: `.gitattributes` `* text=auto eol=lf`, wage-rule-keys timeout, store-tap-targets `\r?\n`. Do not weaken assertions | TODO |
| 2 | P2 gates: unit → full suite+typecheck+lint+build → browser pass per role → independent verifier on sheet Steps | TODO |
| 3 | P3: PR + merge, confirm Vercel Ready for SHA, update tracker xlsx + `docs/qa/R2_ROUND5_RESULTS.md`, tester message (sheet rows → "Fixed - Ready to Retest" + notes + release + SHA), ≤15-line report | TODO |

## Owner decisions
- R2-155: Owner MAY approve a version they prepared — no second person required. **DECIDED**
- Taking defaults unless the owner says otherwise: 167 half-day leave → defer · 173 shift change at clock-out → no (by design) · 175 reopen closed payroll month → defer · 179 break punches → defer · 181 revoked device → accept next-sync revoke · 182 kiosk photo per punch → defer · 177 APK → rebuild unsigned from HEAD · 158 VOID migration → write, owner runs · 160 → inline alert.
- Earlier: 24h time by design (164). Page size 10 (`src/lib/mis/pagination.ts`); `R2_DECISIONS.md` R2-83 "25" is stale.

## Baseline test results (fill at 0b)
- typecheck: green (Mac-1, 2026-10-27) · lint: not finished · Mac-1 mid-run: 4 slow-machine timeouts (`wage-screens`, `r2-qc-corrections`, `r3-mst-import`, `permission-matrix`).
- **0b run 2026-10-28 (pravin, branch @ 8340dd0, `pnpm test`, 118.9 s):** Test Files 5 failed | 373 passed | 1 skipped (379) · Tests 6437 passed | 5 expected fail | 9 skipped (6451).
- All 5 failed files are import-time `ENOSPC: no space left on device` (vitest temp dir; disk at 177 MB free), not assertion failures — their tests never ran:
  `src/server/mis/r3-stk-grn.test.ts`, `src/server/mis/r3-stk-store.test.ts`, `src/server/mis/r3-wrk-engine.test.ts`, `src/server/mis/traceability-view.test.ts`, `src/components/mis/desktop/attendance-month-desktop.test.tsx`.
- The 4 Mac-1 timeout files passed this run. Rerun those 5 after freeing disk to get a clean baseline.

## Log (newest first, one line each: date · account · what · sha)
- 2026-10-28 · pravin · 0b baseline: 373/379 files, 6437 tests pass; 5 files ENOSPC (disk full), rerun needed · 88d7749
- 2026-10-28 · pravin · 0a verified: origin/fix/r2-round5 = 1a87908, nothing to push · 1a87908
- 2026-10-27 · Mac-1 · Phase 0 triage done, HANDOFF.md written, session limit hit before commit/push · (unpushed)
