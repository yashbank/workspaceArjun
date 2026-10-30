# MAX_LOG (append-only, written by the MAX Mac). Line format: ID | STATE | sha | note
## 2026-10-31 Phase 0 triage vs HEAD f85b6cd (branch fix/r2-round6)
R2-234,247 (F1) | TODO | f85b6cd | buildPullPayload ignores defaultShiftId/roster (kiosk-device.ts:696-729)
R2-235,246 (F2) | TODO | f85b6cd | workDateFor `minute < endTime` misfiles OUT after night-shift end (attendance-day.ts:82, WorkDate.kt:35)
R2-236,245 (F3) | TODO | f85b6cd | weeklyOffPaidOn requires MONTHLY, ignores sundayPaid (payroll.ts:168)
R2-237,257,258 (F4) | TODO | f85b6cd | payroll-screen.tsx:418 max-w-2xl, no Half-Day column
R2-238,249 (F5) | TODO | f85b6cd | /mis/me renders "No employee code" with no explanation when unlinked
R2-239,255 (F6) | TODO | f85b6cd | navigation.ts:97 desktop `me` only for WORKER
R2-242,260 (F7) | TODO | f85b6cd | attendance.late_rule_workers is free text; parser in lib/mis/late-rule.ts accepts ALL/DAILY/MONTHLY
R2-243,254 (F8) | TODO | f85b6cd | PunchRepository.dismiss exists, QueueScreen.kt not wired
R2-244 (F9) | ALREADY_FIXED | 48965ff | attendance-screen.tsx:176 past-date Clock In opens punch dialog (time required); window per role unchanged (3-day operator kept)
R2-248 (F10) | TODO | f85b6cd | queue-resolve.ts:73 TOO_OLD skips timing only; correction-window check still parks it
R2-251 (F11) | TODO | f85b6cd | bulkPunch IN never stores shiftId (attendance.ts:484-490)
R2-252 (F12) | TODO | f85b6cd | punch-regularization.ts:28 REVIEW_ACTION='clearance.write'
R2-253 (F13) | TODO | f85b6cd | operatorRoleOf null for ADMIN/OWNER (kiosk-device.ts:638); PunchViewModel.kt:52 OPERATOR_ROLES
R2-256 (F14) | TODO | f85b6cd | D3 applied: non-Owner message prompts "Reopen month"; Owner override (R3 B51/R2-175 contract, tested) kept + drift banner on payroll
R2-259 (F15) | TODO | f85b6cd | same-day second save throws "already scheduled for today" (9a6a1c6, in tester build) -> upsert today's row
R2-241 (F16) | TODO | f85b6cd | shift.start_time/end_time not read anywhere in src; hide from settings list
R2-240 (D1) | TODO | f85b6cd | D1 applied: worker/Admin may cancel approved leave while start date is in the future, with reason
R2-250 (D2) | BY_DESIGN | f85b6cd | D2 applied: Admin cannot set pay type; friendly message instead of raw Forbidden (batch C)
R2-261,262,263 | BY_DESIGN | f85b6cd | 261 deferred, 262 pass, 263 (D4) deferred
## 2026-10-31 Batches A-D on fix/r2-round6 — code commit 08ac369. Gate: typecheck ✓ · lint 0 errors ✓ · vitest 412 files / 6881 tests ✓ · next build ✓ · Android unit tests 47 ✓ · assembleRelease ✓
R2-234,247 (F1) | GATE_PASSED | 08ac369 | kiosk-device.ts buildPullPayload: allocation > attendance > roster/defaultShiftId (resolveEmployeeShiftId). Tests kiosk-device.test.ts "R2-234", r2-round6-att.test.ts
R2-235,246 (F2) | GATE_PASSED | 08ac369 | workDateFor: wrapping shift owns minutes < max(end, start+16h-24h) (attendance-day.ts + WorkDate.kt, same rule). Tests attendance-day.test.ts "R2-235", WorkDateTest.kt (3). R2-52 stale-IN kept
R2-236,245 (F3) | GATE_PASSED | 08ac369 | payroll.ts: weekly off paid when MONTHLY or emp.sundayPaid (DAILY). Sandwich/weekly_off unchanged. Tests payroll-policy-rules.test.ts "R2-236" (2)
R2-237,257,258 (F4) | GATE_PASSED | 08ac369 | payroll-screen.tsx: lg:max-w-6xl, 3-col grid (table 2/3, cards+exports 1/3), Half-day column; phone unchanged. No render test (none exists for this screen) — PRO: check 1920 + 390px
R2-238,249 (F5) | GATE_PASSED | 08ac369 | /mis/me: amber "not linked to an employee record" card when getMisEmployee is null; no auto-link
R2-239,255 (F6) | GATE_PASSED | 08ac369 | navigation.ts: Me in desktop sidebar for every signed-in role. CONTRACT: navigation.test.ts EXPECTED +me per role, navigation-more.test.ts never-leak list -me
R2-242,260 (F7) | GATE_PASSED | 08ac369 | late_rule_workers: <select> ALL/DAILY/MONTHLY (settings-screen.tsx, rules-change-form.tsx), server refuses other text (business-rules.ts). MIGRATION (data only, NOT applied): prisma/migrations/20261031000000_r2_242_late_rule_description — fixes label/description, normalises bad values to ALL. Tests r2-round6-rules.test.ts, settings-screen.test.tsx
R2-243,254 (F8) | GATE_PASSED | 08ac369 | Android QueueScreen.kt: Dismiss (confirm dialog) on REJECTED/PARKED rows via QueueViewModel.dismiss -> PunchQueueDao.delete. Local copy only. No UI test (Compose); PRO: tap-test on tablet
R2-244 (F9) | ALREADY_FIXED | 48965ff | past-date Clock In opens the punch dialog (time required); 3-day operator window unchanged by design
R2-248 (F10) | GATE_PASSED | 08ac369 | queue-resolve.ts: TOO_OLD also sets skipEmployeeChecks (correction window) under attendance.write + note. Test queue-resolve.test.ts "R2-248"
R2-251 (F11) | GATE_PASSED | 08ac369 | attendance.ts bulkPunch IN resolves + stores shiftId (named > roster > default). Test r2-round6-att.test.ts
R2-252 (F12) | GATE_PASSED | 08ac369 | REVIEW_ACTION = attendance.write (+ attendance/page.tsx canRegularize). CONTRACT: reviewers now SUPER_ATTENDANCE_OPERATOR, ATTENDANCE_OPERATOR, ADMIN, OWNER; SUPERVISOR (no attendance.write) no longer reviews — punch-regularization.test.ts updated
R2-253 (F13) | GATE_PASSED | 08ac369 | operatorRoleOf: ADMIN/OWNER -> SUPER_OPERATOR, so the tablet accepts them with no Android change. CONTRACT: kiosk-device.test.ts null-role list -ADMIN/-OWNER, select +defaultShiftId
R2-256 (F14) | GATE_PASSED | 08ac369 | D3: non-Owner closed-month edit says "ask the Owner to reopen the month from Payroll"; Owner-with-reason override kept (R3 B51/R2-175, tested); payroll screen shows amber banner when correctionsAfterClose>0 on a CLOSED month. No snapshot recalculation
R2-259 (F15) | GATE_PASSED | 08ac369 | business-rules.ts updateBusinessRule: P2002 -> update today's row (later edit wins, audited, wage keys redacted). CONTRACT: rule-history.test.ts it.fails->it, r3-sec-rules-docs.test.ts B37 now expects replace, audit-payloads.test.ts reviewed list +1
R2-241 (F16) | GATE_PASSED | 08ac369 | getBusinessRules hides shift.start_time/shift.end_time (rows kept). Test r2-round6-rules.test.ts
R2-240 (D1) | GATE_PASSED | 08ac369 | cancelLeaveRequest: APPROVED leave may be cancelled by its owner / attendance.write while start date > factory today, reason >=3 chars; after start Owner only. UI: leave-screen Revoke + my-leave-screen "Cancel leave". CONTRACT: r2-batch1a-attendance.test.ts + r2-batch1a-screens.test.tsx updated
R2-250 (D2) | BY_DESIGN | 08ac369 | Admin cannot set pay type (rule 13.9). No code change this round: PRO to confirm the existing Forbidden message reads clearly; if raw, log FAIL_BACK
R2-261,262,263 | BY_DESIGN | — | 261 deferred, 262 pass, 263 (D4) deferred
Files outside mis folders: .gitignore (+release/*.apk), prisma/migrations (data migration above), src/server/mis/testing/wage-world.ts (+misBusinessRule.update test double)
APK: release/app-release-unsigned.apk (35 MB, from 08ac369 sources, gitignored — not pushed; build on PRO with JAVA_HOME=<jdk17> ./gradlew assembleRelease if needed)
Migrations for Yash (pnpm db:deploy): 20261031000000_r2_242_late_rule_description (UPDATE only, no schema change)
