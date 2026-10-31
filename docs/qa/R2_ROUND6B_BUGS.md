# R2 Round 6B: tester bugs R2-234 to R2-283 (verbatim from sheet)

Source: tester sheet "MIS Testing R2-V2", tab Bugs, rows 228-277 (read 2026-10-31). Copied faithfully; this file is the only source for the Mac without sheet access. Columns: type, status, severity, role/screen, title, steps, expected, actual, device, round, build, date, tester result (N), tester comment (O). Plan: `R2_ROUND6B_PLAN.md`.

## R2-234
- Type: Bug | Status: Open | Severity: Blocker
- Role/screen: All Workers / `/mis/kiosk` (Pull API)
- Title: Kiosk pull API returns shift null for all unallocated workers, disabling shift window validation on Android kiosk
- Steps: 1. Ensure an employee has defaultShiftId set in mis_employees. 2. Do not allocate employee to a machine today. 3. Call GET /api/mis/kiosk/pull from paired tablet. 4. Inspect employee payload.
- Expected: buildPullPayload should resolve defaultShiftId or MisShiftRoster for today, returning the worker's assigned shift object.
- Actual: misEmployee query in kiosk-device.ts lines 696-713 omits defaultShiftId from select and never queries shift-roster.ts. shiftOf map contains null for 100% of workers arriving for shift start.
- Device: Android / Kiosk | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/kiosk-device.ts lines 696-728, buildPullPayload populates shiftOf solely from active machine allocations and existing attendance records. Unallocated workers checking in get shift: null, causing Android app to display no shift details and fall back to 06:00 rollover.

## R2-235
- Type: Bug | Status: Open | Severity: Blocker
- Role/screen: Night Shift Workers / `/mis/kiosk` & `/api/mis/kiosk/punch`
- Title: Overtime clock-out on night shifts (e.g. 19:00-07:00) falsely flagged as stale, converted to IN punch and rejected
- Steps: 1. Assign worker to night shift (19:00 to 07:00). 2. Clock in at 19:00. 3. Clock out with 15 mins OT at 07:15 next morning. 4. Observe punch response.
- Expected: System should recognize punch as clock-out of yesterday's night shift with 15 minutes of overtime.
- Actual: workDateFor evaluates 07:15 as new calendar day because 07:15 > 07:00 endTime. Since age > 12h, isStaleOpenIn returns true. attendance-punch.ts overrides direction to IN, rejects with OUTSIDE_SHIFT_WINDOW, and leaves night shift as MISSING_OUT.
- Device: Android / Web | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/lib/mis/attendance-day.ts line 82 and attendance-payroll-rules.ts lines 114-120, workDateFor does not account for an overtime grace period past shift endTime. Overtime clock-outs on night shifts cross the day boundary and trigger stale punch splitting.

## R2-236
- Type: Bug | Status: Open | Severity: Major
- Role/screen: Owner, Admin / `/mis/payroll`
- Title: Sunday pay rule unconditionally denies paid weekly off to DAILY workers with sundayPaid=true
- Steps: 1. Open /mis/employees and edit a DAILY worker. 2. Toggle "Paid Sunday" to true and save. 3. Work 6 days Monday through Saturday. 4. Run calculateMonthlyPayroll.
- Expected: Daily worker with sundayPaid flag set should receive full day allowance for Sunday.
- Actual: weeklyOffPaidOn in src/server/mis/payroll.ts line 168 checks payType !== 'MONTHLY'. It ignores emp.sundayPaid completely, leaving daily workers with zero Sunday pay.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/payroll.ts line 168, weeklyOffPaidOn unconditionally returns false if payType !== 'MONTHLY'. Despite Prisma schema line 366 stating DAILY workers receive Sunday pay when sundayPaid=true, the payroll formula never checks this property.

## R2-237
- Type: UI/UX Defect | Status: Open | Severity: Major
- Role/screen: Owner / `/mis/payroll`
- Title: Desktop month-end payroll layout squeezes 8-column data table inside 672px container and stacks 6 full-width action buttons
- Steps: 1. Open /mis/payroll on a standard desktop monitor (1920x1080). 2. Inspect page layout and container dimensions.
- Expected: Screen should feature a responsive dashboard grid: summary cards on top, split sidebar for export actions, and full-width container for the employee counts table.
- Actual: payroll-screen.tsx line 418 wraps the entire page in max-w-2xl (~672px). An 8-column table is squashed horizontally, while 6 full-width buttons stack vertically taking up multiple screens of space.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/components/mis/payroll/payroll-screen.tsx lines 196-424, the entire body is rendered as a single flex-col inside max-w-2xl. Mobile and desktop share identical narrow column flow, degrading usability on desktop and cluttering mobile view with 6 giant stacked buttons.

## R2-238
- Type: Bug | Status: Open | Severity: Medium
- Role/screen: Worker, Operator / `/mis/me`
- Title: Worker self-service links completely vanish if user account is not linked to employee profile via userProfileId
- Steps: 1. Create an employee in /mis/employees. 2. Log in with a user whose ID is not linked to mis_employee.user_profile_id. 3. Navigate to /mis/me.
- Expected: Page should display linked employee onboarding banner or allow claiming profile; worker should see their attendance and leaves.
- Actual: getMisEmployee(user.id) returns null. All navigation links (My attendance, My payslips, My leave, Missed punch) in mis/me/page.tsx are conditionally omitted when employee is null.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/app/(mis)/mis/me/page.tsx lines 36-77, all worker actions require truthy employee. The UI displays no fallback guidance explaining that the user account has not yet been linked to an employee roster entry.

## R2-239
- Type: Bug | Status: Open | Severity: Medium
- Role/screen: Non-Worker Roles (Operator, Storekeeper, Supervisor) / `/mis/me`
- Title: Desktop sidebar navigation completely hides the Me profile tab for any user who does not hold the WORKER role
- Steps: 1. Log in as an Operator, Storekeeper, or Supervisor on Desktop. 2. Look at the left sidebar navigation links.
- Expected: Every authenticated employee should have access to the Me tab to view their own attendance, leave requests, and payslips.
- Actual: navigation.ts line 97 enforces !(entry.id === 'me' && role === 'WORKER'). Operators and Supervisors are stripped of their self-service profile link on desktop.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/navigation.ts lines 76-97, entry 'me' is marked phoneOnly: true and the desktop whitelist specifically permits only role === 'WORKER'. Other staff members on desktop browsers are locked out of their self-service portal.

## R2-240
- Type: Bug | Status: Open | Severity: Medium
- Role/screen: All Workers, Admin / `/mis/me/leaves` & `/mis/attendance/leave`
- Title: Workers and Admins cannot cancel or withdraw an approved future leave request; requires Owner manual database intervention
- Steps: 1. Submit a leave request for next week. 2. Admin approves the leave. 3. Worker's plans change and worker or Admin attempts to cancel it.
- Expected: Workers or Admins should be able to cancel an approved leave before the start date arrives, restoring attendance register status.
- Actual: MyLeaveScreen only shows Withdraw button when status === 'PENDING'. In attendance.ts line 824, cancelLeaveRequest throws if actor.role !== 'OWNER' when status is APPROVED.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/attendance.ts line 824, canceling an approved leave is hard-gated to OWNER only. In src/components/mis/me/my-leave-screen.tsx line 85, no cancel option is rendered for APPROVED rows, trapping workers in leave status.

## R2-241
- Type: Defect | Status: Open | Severity: Minor
- Role/screen: Admin, Owner / `/mis/settings`
- Title: Settings table displays obsolete orphan keys shift.start_time and shift.end_time that are never consumed by the system
- Steps: 1. Navigate to /mis/settings. 2. Locate shift.start_time (09:00) and shift.end_time (18:00). 3. Edit their values. 4. Check shifts on /mis/attendance/shifts.
- Expected: Settings should either configure the factory default shift or be removed from the business rules table to prevent confusion.
- Actual: Shifts are governed independently by the MisShift table. No code in the entire repository references shift.start_time or shift.end_time from business rules.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/business-rules.ts and database migrations, shift.start_time and shift.end_time exist as legacy seeded rows. They do not bind to any operational function, misleading administrators into thinking they are updating factory shifts.

## R2-242
- Type: Bug | Status: Open | Severity: Medium
- Role/screen: Admin, Owner / `/mis/settings`
- Title: attendance.late_rule_workers setting description suggests deduct_ot or absent, but code only parses ALL, DAILY, or MONTHLY
- Steps: 1. Open /mis/settings. 2. Inspect description for attendance.late_rule_workers. 3. Note suggested values "deduct_ot or absent". 4. Save "deduct_ot".
- Expected: Settings description and validation should align with parseLateRule, accepting ALL, DAILY, or MONTHLY.
- Actual: parseLateRule in late-rule.ts lines 20-26 expects pay type prefixes (DAILY / MONTHLY / ALL). Setting deduct_ot fails prefix check and defaults to ALL, applying late grace to everyone.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/lib/mis/late-rule.ts line 25, parseLateRule checks word.startsWith('DAILY') ? 'DAILY' : word.startsWith('MONTHLY') ? 'MONTHLY' : 'ALL'. The UI prompt in settings instructs users to type deduct_ot, causing a complete mismatch between configuration intent and execution.

## R2-243
- Type: Bug | Status: Open | Severity: Major
- Role/screen: Kiosk Operator / `mis-kiosk-android` (Queue Screen)
- Title: Android kiosk offline queue permanently retains REJECTED and PARKED punch entries with no option to clear or dismiss them
- Steps: 1. Disconnect tablet from Wi-Fi. 2. Punch outside allowed shift window. 3. Reconnect tablet; flushQueue runs and server returns REJECTED. 4. Open Offline Queue screen.
- Expected: Rejected punches should display an inline dismiss/delete action, or auto-archive after operator acknowledgment.
- Actual: PunchRepository.kt updates status to REJECTED. QueueScreen.kt renders QueueRow with no delete/dismiss action. Rejected punches accumulate indefinitely in the SQLite Room database.
- Device: Android App | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In mis-kiosk-android/app/src/main/java/com/example/mis_kiosk/ui/queue/QueueScreen.kt lines 83-130 and PunchRepository.kt lines 332-335, rejected punches stay in punch_queue table without purge or manual dismissal mechanisms.

## R2-244
- Type: Bug | Status: Bug Reproduced | Severity: Major
- Role/screen: Admin, Owner / /mis/attendance?view=daily (Past Date)
- Title: Attendance daily register hides Clock In action on unrecorded employees (new:empId) when viewing past dates inside correction window
- Steps: 1. Open /mis/attendance?view=daily&date=[pastDateWithinCorrectionWindow]. 2. Locate unrecorded employee row. 3. Attempt to clock them in.
- Expected: Admin/Owner should have an action to record a manual past punch for unrecorded workers directly from their table row.
- Actual: attendance-screen.tsx line 175 gates Clock In behind isToday. For past dates, isToday is false. The only workaround is navigating through the bulk punch dropdown.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/components/mis/attendance/attendance-screen.tsx line 175, {canWrite && !r.clockIn && isToday && <Button>Clock In</Button>} suppresses single-worker clock-in on past register views, forcing Admins into multi-step bulk operations.

## R2-245
- Type: Bug | Status: Bug Reproduced | Severity: Blocker
- Role/screen: Owner / /mis/payroll
- Title: Daily wage worker Sunday pay fraction is completely zeroed out in month-end calculation
- Steps: 1. Open /mis/employees and set an employee with payType='DAILY' and sundayPaid=true. 2. Record full weekday attendance around Sunday. 3. Open /mis/payroll and calculate period.
- Expected: Sunday / weekly off should be treated as a paid day (fraction = 1) for daily workers with sundayPaid=true when sandwich policy rules are met.
- Actual: weeklyOffPaidOn in src/server/mis/payroll.ts line 168 checks if (payType !== 'MONTHLY' || !isWeekday(date, policy.weeklyOffOn(date))) return false, rejecting all DAILY workers unconditionally.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/payroll.ts:167-172 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/payroll.ts line 168, weeklyOffPaidOn explicitly gates on payType === 'MONTHLY', completely ignoring emp.sundayPaid selected from MisEmployee on lines 363/401 and passed to computeEmployeeMonth. Daily workers with sundayPaid=true lose all weekly off wages.

## R2-246
- Type: Bug | Status: Bug Reproduced | Severity: Blocker
- Role/screen: Worker, Attendance Operator / Android Kiosk & /mis/attendance
- Title: Night shift overtime/handover punch splits work day and pre-selects Clock-IN on Android kiosk
- Steps: 1. Configure night shift 20:00 to 06:00. 2. Worker clocks IN at 20:00 on Day 1. 3. Worker stays 15 minutes OT and scans badge at 06:15 on Day 2.
- Expected: System recognizes 06:15 punch as Clock-OUT for Day 1 night shift with 15 minutes overtime.
- Actual: In attendance-day.ts line 82 and WorkDate.kt line 35, belongsToPreviousDay requires minute < timeToMinutes(shift.endTime). At 06:15 (375 min) vs 06:00 (360 min), minute >= end causes belongsToPreviousDay=false. Android treats yesterday as missed OUT and prompts IN; server leaves Day 1 MISSING_OUT and creates orphan punch on Day 2.
- Device: Android Tablet Kiosk / Web | Round: round 2 | Build: src/lib/mis/attendance-day.ts:82, mis-kiosk-android/.../WorkDate.kt:35 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: Both server workDateFor and Android WorkDate.workDateFor calculate belongsToPreviousDay = shiftWrapsMidnight(shift) && minute < timeToMinutes(shift.endTime). Any worker punching out even 1 minute late after shift end fails this check, breaking night shift attendance daily.

## R2-247
- Type: Bug | Status: Bug Reproduced | Severity: Blocker
- Role/screen: Worker, Attendance Operator / Android Kiosk Roster Pull
- Title: Gate kiosk pull payload returns shift=null for workers not pre-allocated to machine crew
- Steps: 1. Deploy kiosk tablet at factory gate. 2. Pull employee roster before supervisor creates daily machine crew allocations in /mis/crew. 3. Scan general worker or unallocated machine operator badge.
- Expected: Tablet should resolve worker's assigned shift from misEmployee.defaultShiftId or MisShiftRoster for today.
- Actual: kiosk-device.ts line 696 buildPullPayload queries misWorkerAllocation and misAttendance only. It does not select defaultShiftId from misEmployee nor call resolveEmployeeShiftId. Every unbooked employee receives shift: null.
- Device: Android Tablet Kiosk | Round: round 2 | Build: src/server/mis/kiosk-device.ts:696-729 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/kiosk-device.ts line 696, buildPullPayload omits defaultShiftId from db.misEmployee.findMany and fails to call resolveEmployeeShiftId. Unallocated workers scan in with shift: null on the gate tablet.

## R2-248
- Type: Bug | Status: Bug Reproduced | Severity: Blocker
- Role/screen: Super Attendance Operator / /mis/queue
- Title: Resolving parked punches older than offline queue age limit (>72h) fails with correction window error
- Steps: 1. Offline tablet queues punch for >72 hours, parking it as TOO_OLD upon sync. 2. Super Attendance Operator opens /mis/queue and clicks Resolve with a note.
- Expected: Parked punch should be applied past the age tolerance since Super Attendance Operator holds queue.review and attendance.write.
- Actual: queue-resolve.ts line 73 sets skipTiming=true for TOO_OLD but leaves skipEmployeeChecks=false. When submitPunch calls applyPunch, line 279 checks isWithinCorrectionWindow (3 days) and throws CORRECTION_WINDOW_CLOSED.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/queue-resolve.ts:60-75, src/server/mis/attendance-punch.ts:279 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/queue-resolve.ts line 74, skipEmployeeChecks is only set for EMPLOYEE_INACTIVE or CORRECTION_WINDOW_CLOSED. A TOO_OLD punch (>72h) hitting applyPunch fails isWithinCorrectionWindow (3 days) and cannot be resolved from the inbox.

## R2-249
- Type: Bug | Status: Bug Reproduced | Severity: Major
- Role/screen: Worker / /mis/me
- Title: Worker phone portal /mis/me displays blank card with Attendance, Payslips, Leave, and Missed Punch buttons hidden
- Steps: 1. Admin creates worker in /mis/employees. 2. Worker signs into MIS on mobile browser via Supabase Auth. 3. Worker opens /mis/me.
- Expected: Worker sees self-service navigation cards to view their attendance, payslips, leaves, and submit missed punch regularizations.
- Actual: getMisEmployee(user.id) returns null because userProfileId is null on newly created employees. In /mis/me/page.tsx lines 36-77, all 4 Link blocks are guarded by {employee && (...)}. The worker sees a blank card with no buttons.
- Device: Mobile Web | Round: round 2 | Build: src/server/mis/roles.ts:36, src/app/(mis)/mis/me/page.tsx:36-77 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/roles.ts line 36, getMisEmployee queries userProfileId which is only set when Owner grants a role via /mis/settings/users. When unlinked, /mis/me suppresses all 4 action links, leaving workers stranded.

## R2-250
- Type: Bug | Status: Bug Reproduced | Severity: Major
- Role/screen: Admin / /mis/employees
- Title: Admin onboarding monthly staff or assigning wage code receives MisForbiddenError('wages.read')
- Steps: 1. Sign in as Admin. 2. Open /mis/employees and click Add Employee. 3. Enter details and select payType='MONTHLY' or pick a wage code. 4. Click Save.
- Expected: Admin should be able to specify whether the employee is Monthly salaried or Daily paid upon onboarding.
- Actual: employee.ts line 229 calls assertWageFieldsAllowed(actor, input, { wageTypeCode: null, payType: 'DAILY', sundayPaid: false }). Any difference requires wages.read, which Admin does not have. Server throws MisForbiddenError('wages.read').
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/employee.ts:164-175, L229 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/employee.ts line 164, assertWageFieldsAllowed requires wages.read whenever payType != 'DAILY' or wageTypeCode != null. Admin onboarding monthly employees is blocked unless an Owner creates the record.

## R2-251
- Type: Bug | Status: Bug Reproduced | Severity: Major
- Role/screen: Attendance Operator / /mis/attendance
- Title: Bulk Punch clock-in does not resolve or store shiftId, zeroing out Overtime and Late calculations at clock-out
- Steps: 1. Attendance Operator uses Bulk Punch on attendance register to clock in workers. 2. Workers clock out later in the day. 3. Check OT and late minutes on register.
- Expected: Bulk punch should resolve worker shift (from roster or defaultShiftId) and record OT when working past shift end.
- Actual: bulkPunch in attendance.ts lines 485-492 creates/updates MisAttendance without resolving shiftId (leaves it null). At clock-out, punchMinutesNet passes null shift, and punchMinutes line 40 returns { lateMinutes: null, otMinutes: null }.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/attendance.ts:485-492, src/lib/mis/punch-minutes.ts:40 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/attendance.ts line 487, bulkPunch IN upsert does not populate shiftId, unlike single clockIn (L254). PunchMinutes returns null for both OT and lateness whenever shift is null.

## R2-252
- Type: Bug | Status: Bug Reproduced | Severity: Major
- Role/screen: Super Attendance Operator / /mis/attendance & Regularization
- Title: Super Attendance Operator receives Forbidden error when reviewing or approving Missed Punch regularizations
- Steps: 1. Worker submits missed punch request from /mis/me/regularization. 2. Super Attendance Operator attempts to view and approve/reject the regularization.
- Expected: Super Attendance Operator should be authorized to review and approve missed punch requests.
- Actual: punch-regularization.ts line 28 sets REVIEW_ACTION = 'clearance.write'. In permissions.ts, Super Attendance Operator has attendance.write, attendance.read, queue.review, but lacks clearance.write. Action throws MisForbiddenError.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/punch-regularization.ts:28, L143, L165 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/punch-regularization.ts line 28, REVIEW_ACTION is hardcoded to clearance.write (shop-floor line clearance permission) instead of attendance.write. Super Attendance Operator is barred from approving punch regularizations.

## R2-253
- Type: Bug | Status: Bug Reproduced | Severity: Major
- Role/screen: Admin, Owner / Android Kiosk
- Title: Admin and Owner cannot sign in as kiosk operators on Android tablet
- Steps: 1. Launch MIS Kiosk app on Android tablet. 2. On Operator sign-in screen, enter Admin or Owner employee badge code. 3. Tap Start shift.
- Expected: Admin and Owner should be accepted as valid gate operators since attendance-punch.ts OPERATOR_ROLES includes ADMIN and OWNER.
- Actual: kiosk-device.ts line 638 operatorRoleOf maps only ATTENDANCE_OPERATOR and SUPER_ATTENDANCE_OPERATOR, returning null for ADMIN and OWNER. Android PunchViewModel.kt line 298 rejects null operatorRole with 'Not an attendance operator'.
- Device: Android Tablet Kiosk | Round: round 2 | Build: src/server/mis/kiosk-device.ts:638-642, mis-kiosk-android/.../PunchViewModel.kt:298-316 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/kiosk-device.ts line 638, operatorRoleOf returns null for ADMIN and OWNER roles. Android app strictly validates operatorRole in OPERATOR_ROLES, preventing factory Admins and Owners from operating the kiosk tablet.

## R2-254
- Type: Bug | Status: Bug Reproduced | Severity: Minor
- Role/screen: Attendance Operator / Android Kiosk Queue
- Title: Rejected or parked punches cannot be dismissed or cleared from Android tablet offline queue
- Steps: 1. Record punch with invalid operator or badge on tablet while offline. 2. Reconnect tablet; punch flushes and returns status REJECTED. 3. Open Offline queue screen on tablet.
- Expected: Operator should have a Dismiss action to clear acknowledged rejected/parked punches from local storage.
- Actual: QueueScreen.kt line 34 is strictly read-only. PunchRepository.dismiss(key) exists in repository code but has no button or handler wired in QueueScreen. Rejected punches remain permanently in SQLite Room DB.
- Device: Android Tablet Kiosk | Round: round 2 | Build: mis-kiosk-android/app/src/main/java/com/example/mis_kiosk/ui/queue/QueueScreen.kt:34-43 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In QueueScreen.kt lines 34-43, the screen is defined as read-only. Although PunchRepository.dismiss(key) exists to delete entries from punchQueueDao, no dismiss UI exists, leaving poisoned punches accumulated on the tablet.

## R2-255
- Type: Bug | Status: Bug Reproduced | Severity: Minor
- Role/screen: Machine Operator, Supervisor, Store Guy, QC / MIS Desktop Shell
- Title: Desktop sidebar navigation omits 'Me' portal for all roles except WORKER
- Steps: 1. Sign in as Supervisor, Attendance Operator, Store Guy, or QC on a desktop PC browser. 2. Inspect the left sidebar navigation.
- Expected: Staff should have access to /mis/me on desktop to view their personal attendance, leaves, and payslips.
- Actual: navigation.ts line 97 enforces: if (surface === 'desktop' && entry.phoneOnly && !(entry.id === 'me' && role === 'WORKER')) return false. Because entry 'me' is phoneOnly, it is suppressed on desktop for all non-workers.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/navigation.ts:96-97 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/navigation.ts line 97, the desktop filter explicitly excludes the 'me' entry unless role === 'WORKER'. Supervisors, Operators, and Admins using desktop computers cannot navigate to /mis/me.

## R2-256
- Type: Bug | Status: Bug Reproduced | Severity: Major
- Role/screen: Owner / /mis/attendance & /mis/payroll
- Title: Editing attendance in a closed payroll month does not update frozen MisPayrollSnapshotLine
- Steps: 1. Close a payroll month in /mis/payroll. 2. Owner edits an attendance record for that month using EDIT_ATTENDANCE_AFTER_CLOSE. 3. Re-open /mis/payroll or export bank transfer CSV.
- Expected: Corrected attendance should recalculate the employee's payroll line or prompt the Owner that a reopen is required.
- Actual: attendance.ts line 204 only increments correctionsAfterClose on MisPayrollPeriod. computePayroll checks if (period?.status === 'CLOSED') and returns frozen MisPayrollSnapshotLine. The corrected attendance has zero effect on payslips or bank exports.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/attendance.ts:204, src/server/mis/payroll.ts:337-340 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/attendance.ts line 204, editing attendance in a closed month only bumps correctionsAfterClose without recalculating snapshot lines. computePayroll continues serving frozen MisPayrollSnapshotLine data until reopened.

## R2-257
- Type: Bug | Status: Bug Reproduced | Severity: Minor
- Role/screen: Owner / /mis/payroll
- Title: Month-end payroll overview table omits Half-Day column, obscuring half-day attendance breakdown
- Steps: 1. Worker works 20 full days and 4 half days. 2. Owner navigates to /mis/payroll at month end. 3. Review the employee summary table columns.
- Expected: Table should display a Half-Day column showing 4 half days alongside Present (20) or total.
- Actual: Table columns in payroll-screen.tsx lines 363-373 are: Employee, Present, Absent, Leave, OT, Allowance days, Payslip, Sent. Half days are folded into Present count (present += 1 in line 193), hiding half-day data from the Owner.
- Device: Desktop / Web | Round: round 2 | Build: src/components/mis/payroll/payroll-screen.tsx:363-373 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/components/mis/payroll/payroll-screen.tsx lines 363-373, the table header has no Half-Day column. Although halfDay exists on PayrollRow, it is rendered only within Present count, obscuring whether an employee worked half or full days.

## R2-258
- Type: Bug | Status: Bug Reproduced | Severity: Cosmetic
- Role/screen: Owner / /mis/payroll
- Title: Month-end payroll container is constrained to max-w-2xl (672px), squeezing 8 table columns
- Steps: 1. Sign in as Owner on a 1080p or 1440p desktop display. 2. Open /mis/payroll. 3. View the payroll table and action buttons.
- Expected: Desktop layout should expand to full width or max-w-7xl with side-by-side export cards and wide data table.
- Actual: payroll-screen.tsx line 418 wraps the screen in mx-auto w-full max-w-2xl. The 8-column employee table and compliance warnings are squeezed into 672px with unnecessary horizontal scrolling.
- Device: Desktop / Web | Round: round 2 | Build: src/components/mis/payroll/payroll-screen.tsx:418 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/components/mis/payroll/payroll-screen.tsx line 418, the outer div uses max-w-2xl (42rem = 672px), squeezing multi-column tabular payroll data on desktop viewports.

## R2-259
- Type: Bug | Status: Bug Reproduced | Severity: Minor
- Role/screen: Admin, Owner / /mis/settings
- Title: Saving a business rule change twice on the same day throws duplicate constraint error
- Steps: 1. In /mis/settings, edit any business rule (e.g. factory.timezone or offline.clock_skew_minutes). 2. Immediately edit the same rule again on the same calendar day. 3. Click Save.
- Expected: Second edit on the same day should update today's effective row in-place (similar to addWageRate in wage-type.ts).
- Actual: business-rules.ts line 339 invokes createRuleRevision. The database catches @@unique([ruleKey, effectiveFrom]) and line 342 throws: 'A change for this rule is already scheduled for today; edit that one.'
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/business-rules.ts:342, prisma/schema.prisma:1309 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/server/mis/business-rules.ts line 342, updateBusinessRule catches Prisma P2002 error and rejects the update instead of performing an in-place update for existing same-day revisions.

## R2-260
- Type: Bug | Status: Bug Reproduced | Severity: Cosmetic
- Role/screen: Admin, Owner / /mis/settings
- Title: attendance.late_rule_workers setting silently treats unrecognized values like deduct_ot as ALL
- Steps: 1. In /mis/settings, edit attendance.late_rule_workers. 2. Enter descriptive text such as 'deduct_ot'. 3. Save and test lateness application.
- Expected: Setting UI should provide select dropdown or reject invalid options with validation error.
- Actual: parseLateRule in late-rule.ts line 25 checks word.startsWith('DAILY') ? 'DAILY' : word.startsWith('MONTHLY') ? 'MONTHLY' : 'ALL'. Any other text falls back to ALL without notifying the user.
- Device: Desktop / Web | Round: round 2 | Build: src/lib/mis/late-rule.ts:25 | Date: 46325 | Tester result: Fail
- Tester comment: WHY FAIL: In src/lib/mis/late-rule.ts line 25, parseLateRule silently falls back to 'ALL' for any non-daily/monthly string. The settings UI provides a free-text input rather than a constrained enum selector.

## R2-261
- Type: Enhancement | Status: Deferred | Severity: Minor
- Role/screen: Admin, Worker / /mis/approvals & /mis/me/leaves
- Title: Admin and requesting worker cannot withdraw or revoke an approved leave request
- Steps: 1. Worker submits leave; Admin approves it in /mis/approvals. 2. Worker's plans change. 3. Worker or Admin attempts to cancel the approved leave.
- Expected: Worker or Admin can cancel upcoming approved leave if dates are still in future.
- Actual: attendance.ts line 824 enforces if (actor.role !== 'OWNER') throw new Error('Only the Owner can revoke an approved leave'). Neither Admin nor Worker can cancel approved leaves.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/attendance.ts:824 | Date: 46325 | Tester result: Blocked
- Tester comment: INTENDED BY DESIGN: attendance.ts line 824 intentionally restricts approved leave revocation to Owner to prevent retroactive attendance and payroll tampering. Deferred pending business policy change.

## R2-262
- Type: Enhancement | Status: Deferred | Severity: Minor
- Role/screen: Attendance Operator, Supervisor / /mis/attendance
- Title: Attendance Operator and Supervisor restricted to 3-day correction window
- Steps: 1. Attendance Operator logs in. 2. Navigates to /mis/attendance?view=daily with date >3 days in the past. 3. Attempts to record attendance.
- Expected: Operator is restricted to 3 days by design; Admin and Owner get 80 days.
- Actual: business-rules.ts line 217 applies admin edit window for ADMIN and OWNER only, defaulting all other roles to ATTENDANCE_CORRECTION_DAYS (3 days).
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/business-rules.ts:217-224, src/server/mis/attendance.ts:195 | Date: 46325 | Tester result: Pass
- Tester comment: PASS (BY DESIGN): Confirmed with business requirements that Attendance Operators and Supervisors are restricted to 3 days by design. Admin and Owner have the 80-day window verified in guardRegisterDate.

## R2-263
- Type: Enhancement | Status: Enhancement Requested | Severity: Minor
- Role/screen: Supervisor / Shift Roster
- Title: Supervisor cannot assign or modify rotational shift rosters for floor workers
- Steps: 1. Sign in as Supervisor. 2. Attempt to assign worker shifts in shift roster.
- Expected: Shift supervisor on shop floor can adjust weekly shift assignments for their machine crew.
- Actual: shift-roster.ts lines 34 and 72 require attendance.write. Supervisor permissions include attendance.read and attendance.note, but omit attendance.write.
- Device: Desktop / Web | Round: round 2 | Build: src/server/mis/shift-roster.ts:34, L72 | Date: 46325 | Tester result: Blocked
- Tester comment: ENHANCEMENT REQUESTED: Supervisor lacks attendance.write. Management decision required whether to create a dedicated roster.write permission or delegate attendance.write to Supervisor role.

## R2-264
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Admin, Owner, Supervisor / `/mis/orders` & `/mis/production`
- Title: Missing Finished Good Order Quantity and UOM in MisOrder schema prevents batch progress tracking and production gate validation
- Steps: 1. Navigate to /mis/orders. 2. Click "New order". 3. Inspect input fields: Customer, Description, Delivery Date, Notes. 4. Attempt to specify order batch quantity (e.g. 10,000 Boxes).
- Expected: Admin can enter finished product target quantity and UOM (Boxes, Reams, Pcs) so shop floor and production gates know batch targets.
- Actual: MisOrder schema has no quantity or unit columns. Order transitions code explicitly states: "MisOrder carries no ordered quantity... so there is no produced >= ordered gate". Batch completion % cannot be calculated.
- Device: Desktop / Web | Round: round 2 | Build: Add targetQuantity (Decimal) and unit (String) to MisOrder schema; evaluate producedQty >= targetQuantity in computeCloseGates. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in prisma/schema.prisma line 120 and src/lib/mis/order-transitions.ts lines 18-22. MisOrder has no quantity column.

## R2-265
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Admin, Dispatcher, Owner / `/mis/orders` & Job Card / Delivery Challan
- Title: Missing Customer Purchase Order Reference (Customer PO #) column on Orders forces users into document attachments
- Steps: 1. Customer emails PO # PO-AMZ-2026-99. 2. Admin creates order in /mis/orders. 3. Attempt to enter Customer PO number in a dedicated search field. 4. Search /mis/orders?q=PO-AMZ-2026-99.
- Expected: Customer PO # is a first-class searchable field printed on Job Cards and Delivery Challans.
- Actual: No customerPoRef field exists on MisOrder. Admin must bury it in notes or upload as a document attachment via addOrderDocumentAction. Search cannot find orders by Customer PO #.
- Device: Desktop / Web | Round: round 2 | Build: Add customerPoRef String? column to MisOrder and include customerPoRef in search filter and Job Card/Challan print templates. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/orders.ts lines 45-56 and docs/qa/orders-walkthrough.md line 44. Customer PO is only an unstructured document attachment.

## R2-266
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Admin, Owner / `/mis/orders/[id]`
- Title: Reopening a closed/cancelled order sets status to IN_PRODUCTION without restoring deleted stock reservations or machine allocations
- Steps: 1. Order ORD-1 has 200 kg paper reserved in MisOrderStockAllocation and Press #1 booked. 2. Admin cancels order (or completes it). 3. System executes deleteMany on MisOrderStockAllocation and marks machines releasedAt. 4. Later, Admin clicks "Reopen order".
- Expected: System warns that stock allocations and machine bookings were cleared, or automatically re-reserves uncommitted stock and alerts Supervisor.
- Actual: reopenOrder blindly updates status to IN_PRODUCTION. Stock reservations remain deleted; other orders take the stock. Machine bookings remain released, causing silent scheduling conflicts and raw material shortages on the shop floor.
- Device: Desktop / Web | Round: round 2 | Build: reopenOrder must notify Supervisor/Admin about cleared machine allocations and log an audit warning to re-allocate stock reservations. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/orders.ts lines 294-309 and lines 365-386. deleteMany removes all reservations permanently on close with no restore hook on reopen.

## R2-267
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Supervisor / `/mis/orders/[id]`
- Title: Order status can be moved to IN_PRODUCTION while BOM is completely missing, in DRAFT, or REJECTED
- Steps: 1. Create order ORD-2 and click Confirm. 2. Do not create a BOM (or leave it in DRAFT). 3. In /mis/orders/[id], click "Start production".
- Expected: System refuses to transition order to IN_PRODUCTION until a BOM is in APPROVED status.
- Actual: Transition CONFIRMED -> IN_PRODUCTION succeeds without validating BOM status. Shop floor starts production logs on an order without approved specs or material formulas.
- Device: Desktop / Web | Round: round 2 | Build: In updateOrderStatus, gate IN_PRODUCTION transition behind requireApprovedBom(orderId). | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/orders.ts line 225 and src/lib/mis/order-transitions.ts lines 26-33. No BOM status gate exists on start production.

## R2-268
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Production Manager, Storekeeper, Owner / `/mis/bom/[id]` & `/mis/store/requests`
- Title: BOM materials lack basis/yield quantity (per 1 unit vs batch total), causing fixed-quantity material issues regardless of order volume
- Steps: 1. Admin creates BOM for a carton box: Material 1 = 200 kg Kraft paper. 2. Order A is for 500 boxes; Order B is for 50,000 boxes. 3. Auto-issue/request materials for Order B.
- Expected: BOM defines material rate per finished unit (or batch size) so required material scales with order quantity (unitQty * orderQty).
- Actual: MisBomMaterial has only a single flat quantity field. When material request is generated, it requests the exact flat quantity (200 kg) whether producing 100 boxes or 50,000 boxes, causing massive stock shortages or uncontrolled over-issues.
- Device: Desktop / Web | Round: round 2 | Build: Add yieldRatio or perUnitQty on MisBomMaterial and multiply by MisOrder.targetQuantity when generating Material Requests. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in prisma/schema.prisma model MisBomMaterial and src/server/mis/bom.ts lines 297-320. Quantity is flat and unscaled.

## R2-269
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Procurement, Owner / `/mis/bom/[id]` & `/mis/po`
- Title: BOM allows draft materials with null itemId, passing Owner approval but fatally blocking downstream PO submission and Store issues
- Steps: 1. Admin creates BOM material with text description "Special Ink" without linking a catalog item (itemId: null). 2. Submit BOM for approval; Owner approves BOM. 3. Procurement creates a PO linked to this BOM (bomRef: ORD-xxx) and clicks "Submit for Approval".
- Expected: BOM warns or blocks uncatalogued items prior to approval, or auto-generates/links catalog items.
- Actual: BOM is approved with itemId: null. When PO is submitted, po.ts line 363 throws: "Line X has no item. Pick an item from the catalogue on every line." Because the BOM is frozen in APPROVED status, procurement cannot edit it and is blocked from ordering goods until Owner rejects BOM back to DRAFT.
- Device: Desktop / Web | Round: round 2 | Build: Enforce itemId != null in assertBomComplete before BOM can be submitted for approval. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/bom.ts line 304 (itemId is optional) and src/server/mis/po.ts line 363 (PO blocks submission if itemId is missing).

## R2-270
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Owner, Admin / `/mis/bom/[id]`
- Title: assertBomComplete passes when any one stage has materials, allowing empty stages to be submitted and approved
- Steps: 1. Create Stage 1 (Printing) and add 1 material. 2. Create Stage 2 (Lamination) with 0 materials. 3. Click "Submit for approval".
- Expected: System ensures every created BOM stage has required process specifications or materials before submission.
- Actual: assertBomComplete checks materials.count >= 1 across the entire BOM. It permits empty stages, which then create blank job phases and corrupted routing on the shop floor.
- Device: Desktop / Web | Round: round 2 | Build: In assertBomComplete, check that every stage in the BOM has at least 1 material (or valid routing process). | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/bom.ts lines 326-335. materials count is queried across whole BOM without grouping by stageId.

## R2-271
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: Owner / `/mis/bom`
- Title: BOM Overview table displays unpriced floor subtotal without asterisk or warning tag, giving false impression of true job cost
- Steps: 1. Create BOM with 3 materials: Material 1 has rate ₹100, Material 2 and 3 have rate null (unpriced). 2. Owner opens /mis/bom. 3. Check "Estimated Cost" column.
- Expected: Owner should see "₹100 (Floor / 2 Unpriced)" or a warning icon indicating that the total is a partial lower bound.
- Actual: listBomOverviewPage formats formatRupees(rollUp(stages).total) as a plain string "₹100", leading the Owner to assume the entire BOM cost is ₹100 and approving unprofitable customer orders.
- Device: Desktop / Web | Round: round 2 | Build: Append an asterisk or floor badge to estimatedCostLabel in BomOverviewRow when isFloor is true. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/bom.ts lines 208-219. isFloor is omitted from BomOverviewRow.

## R2-272
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Procurement Officer, Owner, Supplier / `/mis/po/[id]` & `/mis/print/po/[id]`
- Title: MisPurchaseOrder lacks deliveryDueDate and paymentTerms columns, emitting incomplete vendor contracts
- Steps: 1. Create PO at /mis/po. 2. Inspect available header fields: Supplier, Purpose, BOM Ref, Notes. 3. Try to specify expected delivery date and payment terms (e.g. Net 30, Advance 50%). 4. Print PO via 🖨 Print PO.
- Expected: PO includes Promised Delivery Date and Payment Terms, which are printed on the official vendor purchase order document.
- Actual: Neither column exists in schema. Printed PO has no delivery date or payment terms. Factory store cannot track supplier lead-time delays or flag overdue deliveries.
- Device: Desktop / Web | Round: round 2 | Build: Add deliveryDueDate (DateTime?) and paymentTerms (String?) to MisPurchaseOrder schema and display on PO print template. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in prisma/schema.prisma model MisPurchaseOrder and src/server/mis/po.ts lines 248-262. Neither field exists in the data model.

## R2-273
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Admin, Owner / `/mis/po/[id]`
- Title: Non-Owner PO creation forces ratePerUnit to 0, breaking ADMIN_ONLY approval threshold and trapping Owner in manual per-line pricing
- Steps: 1. Admin creates buffer stock PO for ₹1,000 worth of packing tape. Admin enters quote rate ₹50. 2. System forces ratePerUnit: 0 because Admin lacks wages.read. 3. Admin submits PO for approval. 4. System flags unpriced: true and overrides approval mode to BOTH. 5. Owner attempts to approve.
- Expected: Admin can enter standard supplier quotation rates (or catalog default purchase rates); approval mode obeys threshold (₹50,000); Owner approves with 1 click.
- Actual: Rate is stripped to 0. submitForApproval sets mode to BOTH. When Owner clicks "Approve", system throws: "Set rates on 1 unpriced lines first." The Owner is blocked from approving until they click into every single line item and re-enter prices manually via RateEditor.
- Device: Desktop / Web | Round: round 2 | Build: Allow Admin to enter quotation rates on DRAFT POs (or auto-populate from catalog item price), and let Owner review/approve in 1 step. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/po.ts lines 282, 373, and 415-416. Admin rates are zeroed out and force BOTH approval mode.

## R2-274
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Procurement Officer, Admin / `/mis/po`
- Title: Lack of cumulative procurement cap allows multiple POs to be raised against the same BOM material, causing duplicate ordering
- Steps: 1. Order ORD-100 has approved BOM requiring 500 kg paper. 2. Admin creates PO-1 for 500 kg paper with bomRef: ORD-100. 3. Next day, another Admin creates PO-2 for another 500 kg paper with bomRef: ORD-100.
- Expected: System checks cumulative ordered quantity across existing POs against the BOM requirement and warns/blocks duplicate orders.
- Actual: createPO only verifies that bomRef order has an APPROVED BOM. It does not check if the materials on that BOM have already been procured. The company double-orders materials, draining working capital.
- Device: Desktop / Web | Round: round 2 | Build: In submitForApproval or addPOItem, check cumulative PO quantities against BOM material quantities and warn if total exceeds 105%. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/po.ts lines 240-272. No cumulative procurement check exists against BOM item requirements.

## R2-275
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Owner / `/mis/po/[id]`
- Title: PO cancellation is blocked by unconfirmed DRAFT GRNs that have not booked stock
- Steps: 1. PO is in APPROVED status. 2. Gatekeeper starts entering a GRN at /mis/grn, creating a DRAFT GRN record. 3. Supplier calls and cancels order due to transport breakdown; gatekeeper abandons draft. 4. Admin tries to cancel PO at /mis/po/[id].
- Expected: Admin can cancel PO because no inventory has been booked to stock (or DRAFT GRN is auto-discarded/warned).
- Actual: cancelPO runs tx.misGrn.count({ where: { poId } }) > 0. Because a DRAFT GRN exists, it throws: "This PO already has a goods receipt (GRN), so it can no longer be cancelled." Admin is stuck with an open PO that cannot be cancelled.
- Device: Desktop / Web | Round: round 2 | Build: In cancelPO, check only CONFIRMED GRNs: tx.misGrn.count({ where: { poId, status: 'CONFIRMED' } }) > 0, and auto-discard DRAFT GRNs. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/po.ts line 432. It counts all GRNs including DRAFTs that never touched stock.

## R2-276
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Procurement Officer / `/mis/po/[id]`
- Title: PO line allows arbitrary unitId that conflicts with linked catalog item unit
- Steps: 1. Catalog item ITEM-001 has unit KG. 2. In PO Add Item, user selects ITEM-001 but specifies unit PIECE or BOX. 3. System creates PO line with mismatched unit. 4. GRN is received.
- Expected: PO line validates that selected item matches catalog unit or enforces standard conversion factor.
- Actual: unitId is stored independently of item.unit. When stock ledger receives 100 PIECE, it adds 100 to the KG inventory ledger, corrupting stock ledger balances.
- Device: Desktop / Web | Round: round 2 | Build: When itemId is selected in addPOItem/updatePOItem, default and validate unitId to match the item catalog unit. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/po.ts lines 284-294. unitId is unvalidated against item.unit.

## R2-277
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Storekeeper, Admin, Owner / `/mis/grn/[id]`
- Title: Confirmed GRNs cannot be reversed or voided, locking erroneous receipts in stock ledger and corrupting 3-way match
- Steps: 1. Storekeeper receives shipment of 500 kg paper. Typo made: enters 5,000 kg. 2. Storekeeper clicks "Confirm GRN". 3. Ledger balances and store transactions immediately update to +5,000 kg. 4. Storekeeper realizes the mistake immediately.
- Expected: Authorized Admin/Owner can execute a "Reverse GRN / Return to Vendor" transaction that safely credits out the exact ledger entries, restores PO outstanding quantities, and updates the invoice record.
- Actual: discardGRN only allows discarding DRAFT GRNs (if status !== 'DRAFT' throw). No reversal or void mechanism exists. The PO is marked COMPLETE. The only workaround is manual stock adjustment, which does not reopen the PO or fix the supplier invoice liability.
- Device: Desktop / Web | Round: round 2 | Build: Implement reverseGRN server function with reverse ledger entries (STORE_RETURN/GRN_VOID), resetting PO line counters and updating invoice. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/grn.ts lines 430-450 and src/server/mis/store.ts. No voidGRN or reverseGRN function exists.

## R2-278
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Storekeeper, QC Inspector / `/mis/grn/[id]`
- Title: Damaged quantities on confirmed GRN lines are dropped from inventory ledger instead of booking to Quarantine stock
- Steps: 1. Delivery arrives: 100 kg ordered. Challan says 100 kg. Storekeeper finds 20 kg damaged, 80 kg acceptable. 2. Storekeeper enters receivedQty: 80, damageQuantity: 20, dcQuantity: 100. 3. Clicks "Confirm GRN".
- Expected: 80 kg is booked to Main Stock and 20 kg is booked to Quarantine/Damaged Stock location with traceability to the supplier, ready for return/debit note.
- Actual: In confirmGRN: if (grnItem.receivedQty.toNumber() <= 0) continue. Only 80 kg is written to MisInventoryLedger. The 20 kg damaged material sitting on the factory dock has ZERO record in the warehouse ledger. When the supplier truck comes to collect rejected material, storekeeper cannot issue an Outward Gatepass because the system shows 0 damaged stock.
- Device: Desktop / Web | Round: round 2 | Build: Record damaged quantities in a quarantine ledger location (or MisStoreTransaction with type DAMAGED_RECEIPT) for supplier claim traceability. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/grn.ts lines 623-630. Damage quantities are skipped and never posted to inventory.

## R2-279
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Owner / `/mis/grn/[id]`
- Title: Over-receipt override mechanism allows unbounded receipt quantities above PO with no ceiling or financial cap
- Steps: 1. PO is for 100 kg @ ₹500/kg (₹50,00,000 liability). 2. Storekeeper or Admin accidentally types 10,000 kg. 3. System warns: "Line takes at most 102 kg (ordered 100 kg + 2% tolerance). An admin or owner can override with a reason." 4. Admin types reason "Approved by manager" and confirms.
- Expected: System enforces a hard commercial maximum override ceiling (e.g. max 110% or ₹25,000 value limit) and requires Owner sign-off for massive quantity jumps.
- Actual: The override accepts ANY quantity. The system books 10,000 kg (₹50,00,000 liability) without a second-level financial confirmation, inflating inventory and vendor liability by 100x.
- Device: Desktop / Web | Round: round 2 | Build: Add hard cap (e.g. max 110% of PO quantity) beyond which even Admin override is blocked without explicit Owner sign-off. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/grn.ts lines 138-157 and src/lib/mis/receipt-rules.ts lines 60-80. Any reason bypasses the cap completely.

## R2-280
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Accounts, Owner / `/mis/supplier-invoices` & `/mis/grn`
- Title: Supplier invoice price/quantity discrepancy flags are purely informational and do not block payment approval
- Steps: 1. PO rate is ₹100/unit. Supplier invoice arrives at ₹150/unit. 2. GRN confirms with supplierInvoiceAmount. 3. System marks invoice status as DISCREPANCY. 4. Accounts clerk visits supplier invoices screen.
- Expected: Invoices in DISCREPANCY status require an explicit Debit Note or Owner Variance Sign-off before being eligible for payment mark-off or ERP export.
- Actual: Discrepancy is purely visual text. There is no variance sign-off gate, allowing overbilled vendor invoices to be paid without financial controls.
- Device: Desktop / Web | Round: round 2 | Build: Add requireVarianceResolution gate preventing invoice status from moving to PAID/VERIFIED while in DISCREPANCY. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/supplier-invoice.ts lines 80-140 and src/lib/mis/invoice-match.ts. DISCREPANCY is non-blocking.

## R2-281
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Storekeeper / `/mis/store/receive` & `/mis/store/issue`
- Title: Store receipt and issue cart commits lack client idempotency key, allowing double-booking on network timeouts
- Steps: 1. Storekeeper scans 10 boxes at factory entrance on tablet/phone. 2. Taps "Confirm Receipt" or "Confirm Issue". 3. Cellular/WiFi connection blips; browser times out. 4. Storekeeper taps "Confirm" again.
- Expected: Client transmits unique UUID idempotencyKey; server executes atomically or returns existing receipt/issue result.
- Actual: Neither commitReceipt nor commitIssue takes an idempotency key. Both requests succeed, booking 20 boxes to stock instead of 10 and corrupting physical inventory counts.
- Device: Desktop / Mobile | Round: round 2 | Build: Pass a client-generated cartId/idempotencyKey into commitReceipt and commitIssue, using MisQueuedWrite / dedupe table. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store.ts lines 1130-1250 and lines 1383-1490. No idempotency check exists on cart transactions.

## R2-282
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Storekeeper (`STORE_GUY`) / `/mis/orders` & `/mis/store`
- Title: STORE_GUY role has read-only access to orders but cannot view BOM material requirements to pre-kit shop-floor issues
- Steps: 1. Storekeeper logs in with STORE_GUY role. 2. Wants to prepare raw materials for tomorrow's printing runs. 3. Clicks on /mis/orders and opens an order.
- Expected: Storekeeper can view the order's approved BOM material list (without prices) so they can pre-stage paper reels and plates.
- Actual: BOM screen and navigation hide BOM details for STORE_GUY (orders.write required for BOM screens or redirected). Storekeeper must wait for shop-floor supervisor to verbally request materials at the counter, creating line idle time.
- Device: Desktop / Web | Round: round 2 | Build: Grant store.read / orders.read access to view-only BOM structure without prices in navigation.ts and bom-screen.tsx. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/navigation.ts and src/components/mis/bom/bom-screen.tsx. STORE_GUY is redirected away from BOM views.

## R2-283
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Admin, Owner / `/mis/store/count`
- Title: Physical stock count reconcile applies recorded discrepancy delta rather than recalculating against live ledger balance
- Steps: 1. Physical count at 10:00 AM records 90 units (system ledger was 100, delta = -10). 2. At 11:00 AM, 15 units are issued for an urgent job (new system ledger = 85). 3. At 12:00 PM, Admin clicks "Reconcile Count".
- Expected: System re-evaluates physical count (90) against current balance (85) or blocks reconcile if movements occurred since the count was recorded.
- Actual: reconcilePhysicalCount blindly applies the cached discrepancy (-10) to the current balance (85 - 10 = 75), leaving book stock at 75 when physical stock was 90, creating a permanent 15-unit inventory drift.
- Device: Desktop / Web | Round: round 2 | Build: In reconcilePhysicalCount, recompute adjustment = physicalQty - currentBalance under the item lock, or refuse if transactions occurred after count.createdAt. | Date: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store.ts lines 625-670. Reconcile applies stored count.discrepancy without recalculating against fresh balance.
