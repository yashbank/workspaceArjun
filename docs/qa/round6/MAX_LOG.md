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
