# R3-ATT: Attendance register, leave, shifts, kiosk server, permission widening

Backlog: B51-B64. Branch `fix/r3-att`. **Wave 1.** Model: Sonnet. Opus reviews the `permissions.ts` hunk and the correction-window hunk. Schema: **N**. Estimate: ~140 agent-min.
Must follow `mis-permission-matrix` for the widening (item 12).

## Owned files
- `src/server/mis/attendance.ts`, `attendance-month.ts`, `attendance-punch.ts`, `kiosk-device.ts`, `src/app/api/mis/kiosk/**` (incl. `respond.ts`)
- `src/lib/mis/permissions.ts` (**only this cluster edits it in R3 waves 1-2**), `src/server/mis/permission-matrix.test.ts` (extend the expectations for the 3 approved grants only, with a comment citing R3 B64). You may also change the role-tab expectations in `src/server/mis/navigation.test.ts` and `src/components/mis/home/bottom-nav.test.tsx` that the grants change (e.g. STORE_GUY gains `orders`), each with a comment. Do NOT edit `navigation-more.test.ts` or `navigation.ts`: those are R3-WRK's.
- `src/app/(mis)/mis/attendance/**` **except** `attendance/extra-pay/**` (R3-SEC owns that)
- `src/components/mis/attendance/attendance-screen.tsx`, `leave-screen.tsx`, `shifts-screen.tsx`, `src/components/mis/desktop/attendance-month-desktop.tsx`, `src/components/mis/home/attendance-home.tsx`
- New tests `src/server/mis/r3-att-*.test.ts`

## Read-only for you
`payroll*.ts`, `extra-pay-days.ts`, `employee.ts` (R3-SEC), `approvals/actions.ts` (R3-ORD wave 2 wraps `approveLeaveAction`; keep `approveLeave(leaveId, approve)`'s signature), `worker-allocation.ts` (R3-WRK), Android code (R3-AND).

## Items and acceptance
1. **B51 register writes** (`editAttendance`, `clockIn`, `clockOut`, `approveClockOut`):
   - (a) `status` must be in the attendance status set (grep the constant used by `applyPunch`/`DAY_FRACTION`), else `Error('Unknown status')`.
   - (b) The row's date must be within `getCorrectionWindowDays()` of factory today, else `Error('Outside the correction window (N days)')`.
   - (c) If the row's month has a CLOSED `MisPayrollPeriod`: refused, unless the actor is OWNER and passes `override: { reason >= 3 }`. That writes audit action `EDIT_ATTENDANCE_AFTER_CLOSE` and bumps `correctionsAfterClose` if that counter exists (grep it). Otherwise just the audit row.
   - (d) An unknown id → typed not-found.
   - (e) `clockOut`: requires `clockIn` set, `clockOut` null, and out > in.
   - (f) `approveClockOut`: requires `clockOut` set, and the approver's own employee id != the row's employee.
   - (g) `clockIn`: employee active; refused if the row already has `clockIn`.
   - Tests: one per letter. For (c), OWNER with a reason → OK and the audit row exists; ADMIN with a reason → refused.
2. **B52 `approveLeave`:**
   - Read first. Unknown → not-found. Status != PENDING → `Error('This leave was already decided')`. Write with `updateMany({ where: { id, status: 'PENDING' } })`; count 0 → the same message.
   - The actor's own employee may not decide their own request.
   - Audit carries before/after status.
   - Permission stays `attendance.write`. Whether only Approvals-inbox holders may approve is owner question Q1, and Q1's default is no narrowing.
   - Tests:
     - Approve, then reject the same id → second refused.
     - Self-approve → refused.
     - Unknown id → not-found, not P2025.
3. **B53 leave writes the register.** Inside the approve tx, for each date of the leave, upsert `MisAttendance` status LEAVE **unless** the row has `clockIn`/`clockOut` or `editedAt` (skip, and list the skipped dates in the result). Rejecting an approved leave is impossible (B52), so there is no reverse path. Tests: approve → a LEAVE row exists and payroll's leave count for that employee/month = 1. A day with a punch is skipped.
4. **B54 `requestLeave`:** date matches `^\d{4}-\d{2}-\d{2}$` and is a valid date; the employee is active and not deleted; refuse when a PENDING or APPROVED request exists for that employee and date ("A leave request for this day already exists"). Tests.
5. **B55 `markAbsentBulk`:**
   - Date key validated and within the correction window; future dates refused.
   - `employeeIds` must exist and be active. Skip rows with `clockIn`/`clockOut`, status LEAVE or an `editedAt` (return `skipped: [{employeeId, reason}]`).
   - Set `editedAt`/`editedById`.
   - One `$transaction`. Audit: `entityId` = a fixed token `bulk`, `after: { date, count, employeeIds }`.
   - Tests: a punched employee is skipped. One failing id → nothing written. A future date → refused.
6. **B56 `saveShift`:**
   - `startTime`/`endTime` match `^([01]\d|2[0-3]):[0-5]\d$`, and start != end.
   - Name trimmed and unique (case-insensitive) among active shifts.
   - `isDefault: true` clears the flag on the others in the same tx.
   - New `setShiftActive(id, isActive)` (`attendance.write`, audit). The screen gets a Deactivate/Activate button with `useConfirm`. Deactivating the only default shift is refused.
   - Tests per rule.
7. **B57 punch identity.** `applyPunch` / `ingestDevicePunch`: when `operatorId` is present it must be an active employee whose role is ATTENDANCE_OPERATOR, SUPER_ATTENDANCE_OPERATOR, ADMIN or OWNER. Otherwise REJECTED `BAD_OPERATOR` (not retryable). A `shiftId` hint that is not an active shift → REJECTED `BAD_SHIFT`. Tests: an unknown operator → BAD_OPERATOR. An inactive shift → BAD_SHIFT. A valid one is applied as today.
8. **B58** `PunchResult` gains an optional `note: 'ALREADY_IN' | 'NO_OPEN_IN'` when an IN is absorbed or an OUT has no open IN. Additive JSON: older tablets ignore it. Tests.
9. **B59** `readJsonBody`: a body over the limit returns **HTTP 413** `{ error: 'PAYLOAD_TOO_LARGE' }` and is never coerced to `{}`. The punch route limit is 16 KB, other kiosk routes keep 4 KB. Tests: 17 KB → 413. 15 KB of valid punch → applied.
10. **B60 server half of ATT-19.** The pull payload adds `factoryTimezone: string` (from `getFactoryTimezone()`) and keeps `active_shifts` windows as today. `PunchResult` (APPLIED/duplicate) adds `workDate: 'YYYY-MM-DD'` (the server's `workDateFor` result). Both additive. Tests: the pull JSON has `factoryTimezone`. A 22:10 IST IN on a 22:00-06:00 shift returns `workDate` = that day. A 05:00 OUT next morning returns the same `workDate`.
11. **B61** `claimEnrolment` ALREADY_CLAIMED returns `detail: 'This code was already used. Ask an Admin to retire <deviceName> in Settings → Devices, then pair again.'`. No token re-issue. Test.
12. **B64 permission widening** in `permissions.ts`:
    - Add the action `'attendance.note'` to `MIS_ACTIONS` with a comment: "R3 B64: add a note to a register row; no status/time change."
    - Grant it to ADMIN, SUPERVISOR, SUPER_ATTENDANCE_OPERATOR, ATTENDANCE_OPERATOR (OWNER gets it automatically).
    - Add `'qc.write'` to SUPERVISOR and `'orders.read'` to STORE_GUY. Nothing else changes.
    - New `addAttendanceNote(attendanceId, note)`: `requirePermission('attendance.note')`; note trimmed, 1..500 chars; the row's employee must be in `resolveVisibleEmployeeWhere(actor)`; refused in a CLOSED month; writes only `notes` (append: "<existing>\n[<actor name> <factory date time>] <note>"). Audit `ATTENDANCE_NOTE` before/after notes.
    - UI: the attendance screen shows "Add note" for holders of `attendance.note` who lack `attendance.write`.
    - Tests:
      - A `describe.each` over all 8 roles for `addAttendanceNote` (allowed: OWNER, ADMIN, SUPERVISOR, SUPER_ATTENDANCE_OPERATOR, ATTENDANCE_OPERATOR).
      - SUPERVISOR `addQcCheck` allowed (import from `qc.ts`, do not edit it).
      - STORE_GUY `getOrder`/order list allowed, plus a **money-key scan** of the order detail page props and `getBom` for STORE_GUY (no `rate`, `amount`, `₹`, `price`).
      - Nav: STORE_GUY nav contains Orders; SUPERVISOR's QC screen shows Add check (component test using `can`).
      - The completeness assert over `MIS_ROLES`.
13. Comment fix (from R3-SEC B41) on `users.invite`: "Owner only. Admin may set roles strictly below ADMIN on employee rows (B41); never ADMIN or OWNER."
14. **B62** `getMonthlyAttendance` / `getMonthSummary` take a month key and use `dateKeyToDbDate` bounds (half-open). The attendance page reads `?month=YYYY-MM` (default: factory current month) and shows a month picker. `?date=` is validated against the date-key regex, else falls back to factory today. Tests: month bounds for Oct 2026 in IST include the 31st. `?date=foo` renders today.
15. **B63** `attendance-screen`, `leave-screen` and `shifts-screen` use `formatFactoryTime`/`formatFactoryDate`; grep test: no `toLocale` in those files. Every export of `attendance/actions.ts` is wrapped in `asResult`. Callers show a toast on `ok:false` (e.g. "This leave was already decided"). Empty states for "no shifts" and "no leave requests". One test per action family.

## Do not touch
Payroll computation, extra-pay, employee writes, Android, `worker-allocation.ts`, schema, kit, `idempotency.ts` core (punch idempotency stays as is). Keep green: `attendance-punch.test.ts`, `attendance-access.test.ts`, `attendance-month.test.ts`, `attendance-punches-detail.test.ts`, `kiosk-device.test.ts`, `navigation*.test.ts`, `guard.test.ts`. Expected changes to `permission-matrix.test.ts`: only the 3 grants plus the new action, each with a comment.

## Risk notes
B52 keeps today's roles. If the owner answers Q1 "narrow", that is a follow-up one-line change. B53/B51 change payroll inputs for open months. B57 could reject punches from tablets whose operator is mis-set: check live data first with a read-only SELECT (distinct `operator_id` on recent punches vs employee roles) and report the count in the PR before merging.
