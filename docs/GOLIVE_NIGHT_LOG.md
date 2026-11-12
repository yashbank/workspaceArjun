# Go-live night log (branch `golive-prep`, 4 commits + fixes, not pushed)

## MORNING REPORT
**Done**
- P1: `pnpm golive:clean` -> data/golive/*.json. 5 shifts, 27 users, 149 employees, 0 dup codes. Original xlsx untouched. Night shift 20:00-05:00 cross-midnight tested; start==end shift guard added.
- P2: `scripts/golive/create-users.ts` (dry-run default). Emails `first.last@bpp-demo.com`, temp passwords go to `~/golive-credentials/` (outside git, gitignored). Own email/password change at `/mis/me/account`; Admin/Owner reset of any user's email/password from Settings > Users (Admin cannot touch Owner). Fixed email-change callback bug. Tested with vitest only.
- P3: setting `employee.code_style` (EASY=EMP001 default, MEDIUM=EMP-0001, HARD=6 char, DIFFICULT=10 char+check). Kiosk punch, badge scan, employee create use it. Stored codes never rewritten. Tested for all 4 styles.
- P4: fixed R2-162, 180, 181 (backend), 183, 386. R2-262 not a bug (rule-driven). Skipped: R2-182 (Android native), R2-397, R2-406 (redesign, breaks "small changes" rule). Rest out of scope (list below).
- Reviewer found 4 bugs (Store Guy role map, duplicate employees on user create, wrong-person badge fallback, loader touching production-linked rows). All fixed and re-tested.

**Tests:** vitest 7466 pass / 0 fail; tsc clean; eslint 0 errors on changed files. NOT done: real browser/kiosk flow (pair, sign-in, punch, handover, offline queue) and 5-sample-employee payslip check. Covered only by existing unit tests. No Playwright run, no live auth/email test.

**Blocked / needs your decision**
1. NO REAL RUN HAPPENED (wipe, load, user create). Load is refused by design: 9 codes collide (EMP001-009: client file vs different people already in DB) and 6 of them (EMP004-009) are referenced by production logs. Renaming would rewrite production history, which the hard rules forbid. Also 67 of 84 employees are protected (53 production logs, 14 linked to users), so the wipe removes only 17 test employees. Choose: (a) renumber the client file codes (e.g. start at EMP101), or (b) accept renames. Then re-run dry-run.
2. Load changes live Night Shift 22:00-06:00 -> 20:00-05:00; needs `ALLOW_SHIFT_TIME_CHANGE=1`.
3. Wipe needs `ALLOW_QUEUE_WIPE=1` (1 pending kiosk queued punch write exists).
4. Users: all 27 have no real email, demo `@bpp-demo.com` addresses cannot receive mail: forgot-password will not work for them; use Admin reset. 10 of 27 user links skipped as ambiguous until employees are loaded; run `golive:load` first, then `create-users`.
5. Designation is not stored (no column; schema change needed).
6. Departments left unmerged: Packaging / Packaging Production / Packing.
7. R2-181: punch from a revoked tablet is still accepted (parked) on purpose; Android must read `wipe:true`. R2-183 changed the default attendance screen to the day register: confirm.
8. Hard-rule note: Rule 2 (small changes) is stretched by the user-requested features (account page, code-style module).

**Dry-run counts (live DB kmaxtksmeabmmlervpjl, see docs/golive-dryrun.txt)**
- Wipe would delete: 259 punches, 372 attendance, 12 leave, 1 extra-pay day, 1 payroll period, 268 queued punch writes, 17 employees. Keeps 14 profiles, 3 shifts, 11 depts, 13 devices.
- Load would add: 140 employees, 4 shifts, 13 departments; update 3; skip 6 protected.
- Users: link 4, create 13, skip 10 ambiguous.

**Commands after you approve (only after fixing collisions, item 1)**
```
cd "Workspace Arjun - Live Project/Arjun/app"
CONFIRM_WIPE=1 ALLOW_QUEUE_WIPE=1 pnpm golive:wipe -- --execute
CONFIRM_WIPE=1 ALLOW_SHIFT_TIME_CHANGE=1 pnpm golive:load -- --execute
CONFIRM_WIPE=1 npx tsx scripts/golive/create-users.ts --execute
killall caffeinate
```
(check `package.json` for exact script names; all are dry-run without the flags)


Target DB: Supabase project `kmaxtksmeabmmlervpjl` (the only DB in .env.local).
Original client file untouched: `~/Downloads/BPP-Client-Data-Template - R1.xlsx`.

## Phase 4 scope decision (tester sheet, 400 rows read for Deferred + rows 424-455 Bug Reproduced; no "New Bug" rows exist)
In scope (attendance/payroll/employees/shifts/users/kiosk): R2-162, R2-180, R2-181, R2-183, R2-262, R2-386 (shared SearchInput, tiny).
Skipped by HARD RULE (redesign, not "small"): R2-397 (employee list KPI cards/icon actions), R2-406 (payroll tabs redesign).
Skipped, native Android build not possible here: R2-182.
Out of scope: R2-190, R2-345 (orders/dispatch), R2-342 (queue), R2-385, R2-390 (danger zone), R2-387/388 (combobox/store), R2-389 (theme), R2-391..396, 398..405 (orders/prod/bom/qc/po/grn/store UI), R2-407..414 (dashboard).

## Log
- R2-162 FIXED: ADMIN with no reportees is unscoped (sees all employees; wages untouched; Admin with a branch stays on D4) — src/server/mis/visibility.ts, visibility.test.ts
- R2-180 FIXED: Admin on /mis/payroll gets attendance checks + per-person attendance counts only (no wage figures computed or sent; Owner screen unchanged) — src/server/mis/payroll-period.ts (getAttendanceReadiness), src/components/mis/payroll/attendance-readiness-screen.tsx, src/app/(mis)/mis/payroll/page.tsx, r2-180-attendance-readiness.test.ts
- R2-181 FIXED (backend): pull already 401 REVOKED+wipe on next contact; punch from a retired tablet still lands parked (D18, no data loss) but the 200 body now also carries error:'REVOKED', wipe:true — src/server/mis/attendance-punch.ts, src/app/api/mis/kiosk/punch/route.ts (+route.test.ts); Android not edited
- R2-183 FIXED: bare /mis/attendance is the day register (actions); D8 matrix opens via its ?month= links, new "Month matrix" link on desktop register; pinned contract test updated — src/lib/mis/attendance-month.ts, attendance/page.tsx, attendance-screen.tsx, attendance-month-desktop.test.tsx
- R2-262 NOT-A-BUG / NEEDS-DECISION-ONLY-IF-CHANGE-WANTED: window already follows rule ATTENDANCE_CORRECTION_DAYS (default 3; Admin/Owner key attendance.edit_window_days_admin) in getCorrectionWindowDays; tester sheet says 3-day is by design; no code change
- R2-386 FIXED: SearchInput resyncs to an externally changed value (Clear filters), ignoring the echo of its own search — src/components/mis/kit/search-input.tsx (+test)
