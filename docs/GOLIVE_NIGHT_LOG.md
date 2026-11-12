# Go-live night log (branch `golive-prep`)

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
