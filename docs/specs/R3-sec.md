# R3-SEC: Security guards, employee IDOR, business rules, payroll money

Backlog: B33-B50. Branch `fix/r3-sec`. **Wave 1.** Model: Sonnet. **Opus reviews the diff** (money + roles). Schema: **N**. Estimate: ~150 agent-min.
Must follow the `mis-permission-matrix` skill: table-driven role tests over all 8 roles plus a recursive money-key scan for every new or changed reader.

## Owned files
- `src/server/mis/employee.ts`, `employee-photo.ts`, `users.ts`, `business-rules.ts`, `documents.ts`, `payroll.ts`, `payroll-period.ts`, `extra-pay-days.ts`, `src/lib/mis/roles.ts`
- `src/app/(mis)/mis/employees/**` (incl. `[id]/page.tsx`, `actions.ts`), `src/app/(mis)/mis/settings/actions.ts`, `settings/users/**`, `settings/wages/**`, `settings/rules/**`, `src/app/(mis)/mis/payroll/**`, `src/app/(mis)/mis/attendance/extra-pay/**`, `src/app/(mis)/mis/audit/page.tsx`, `src/app/(mis)/mis/print/payslip/**`, `src/app/(mis)/mis/documents/**`
- `src/components/mis/employees/**`, `src/components/mis/payroll/**`, `src/components/mis/attendance/extra-pay-propose-screen.tsx`, `src/components/mis/traceability/traceability-screen.tsx`, `src/components/mis/desktop/traceability-desktop*.tsx`, `src/components/mis/desktop/rules-*.tsx`, `src/components/mis/desktop/documents-*.tsx`, `src/components/mis/settings/users-screen.tsx`, `settings-screen.tsx`
- New tests `src/server/mis/r3-sec-*.test.ts`

## Read-only for you
`permissions.ts` (R3-ATT owns it this round; **do not edit**), `attendance.ts`, `approvals/actions.ts` (R3-ORD wave 2), `orders/actions.ts`, `lib/mis/safe-href*` (reuse), `audit.ts`, `traceability.ts`.

## Items and acceptance
1. **B33 wage fields are OWNER-only on the server.** In `createEmployee` and `updateEmployee`: if the input contains `wageTypeCode`, `payType` or `sundayPaid` **with a value different from the stored one** (create: different from the defaults null/DAILY/false) and the actor lacks `wages.read`, throw `MisForbiddenError('wages.read')`. An unchanged value passes. Tests:
   - ADMIN posts `{wageTypeCode:'HIGH'}` → forbidden.
   - ADMIN saves the name with an unchanged `wageTypeCode` → OK.
   - OWNER changes → OK.
   - ADMIN create with `sundayPaid:true` → forbidden.
2. **B34** `auditSafeEmployee` includes the wage code as `payCode` (code only, never an amount). Plus `payType` and `sundayPaid`. Test: an update's audit `before/after` shows `payCode` changing. The existing "no `wage` substring" test stays green.
3. **B35** `updateEmployee`, `deleteEmployee` and `restoreEmployee` refuse when the target's role is OWNER and the actor is not OWNER (`MisForbiddenError`). `deleteEmployee` refuses `target.userProfileId === actor.userId` ("You cannot delete your own record"). Tests per case.
4. **B36 IDOR.** `getEmployee`, `updateEmployee`, `deleteEmployee`, `restoreEmployee` and `getEmployeePhoto` apply `resolveVisibleEmployeeWhere(actor)` in the Prisma `where`. A not-visible row gives `notFound()` on the page and a typed not-found error in the server function (same message as unknown id). Test: a supervisor with a pool not containing X gets not-found for X on all five functions. OWNER sees all.
5. **B37 business rules.** `updateBusinessRule` validates the value against the rule's `valueType` (number: finite; integer rules: integer; ranges: `PO_APPROVAL_THRESHOLD` 0..10,000,000, correction-window days 0..60). The keys `PO_APPROVAL_THRESHOLD` and the attendance correction-window key (grep `getCorrectionWindowDays`) require `wages.read`. A same-day second revision maps P2002 to "A change for this rule is already scheduled for today; edit that one". Tests:
   - ADMIN on the threshold → forbidden.
   - OWNER "abc" → refused.
   - OWNER 5000 → OK.
   - Duplicate same-day → friendly message.
6. **B38 links.** `addDocument` runs `safeHref` on `filePath` (a single choke point covers `addDocumentAction`, `addOrderDocumentAction` and `saveDocumentLink`). `traceability-screen.tsx` and the traceability desktop render document links only through `safeHref` (an unsafe value renders as plain text, no `<a>`). Tests: `javascript:alert(1)`, `data:text/html,...` and `http://evil` (if `safeHref` rejects off-site, follow its rule) → refused at `addDocument`. Component test: an unsafe stored value has no anchor.
7. **B39** audit page: `limit` is clamped to 1..500 (default 100, NaN → default). `from`/`to` must match `^\d{4}-\d{2}-\d{2}$`, else they are ignored. Page test with `?limit=abc&from=zzz` renders the list.
8. **B40** `grantMisRole`, `inviteMisUser` and `linkOrCreateMisEmployee`: `isMisRole(role)` or `Error('Unknown role')`. Refuse a change that leaves zero active OWNERs. Refuse profiles that are suspended/inactive ("Reactivate the user first"). Tests.
9. **B41** (default for owner Q2) `assertMayAssignRole`: ADMIN may assign only roles strictly below ADMIN (SUPERVISOR, QC, ATTENDANCE_OPERATOR, SUPER_ATTENDANCE_OPERATOR, STORE_GUY, WORKER). OWNER may assign any role. Document the rule in `roles.ts`. R3-ATT fixes the `users.invite` comment in `permissions.ts` (its acceptance 13). Test: ADMIN → ADMIN is forbidden.
10. **B43 DEPARTMENTS extra pay.** `calculateMonthlyPayroll` loads each employee's `departmentId` and `computeEmployeeMonth` applies a DEPARTMENTS-scoped approved day when `departmentIds` contains it. `proposeExtraPayDayAction` accepts `departmentIds`. Tests: an approved DEPARTMENTS day for dept D pays the employees in D and not those outside D.
11. **B44** `calculateMonthlyPayroll` seeds `byEmployee` from **active, non-deleted employees with a wage code** (plus anyone with rows). An employee with zero rows gets a line through the zero-row path (MONTHLY: Sundays paid; allowances; extra-pay EMPLOYEES scope). Tests: a MONTHLY employee with no rows in a 4-Sunday month gets 4 Sunday units. `getMonthWageBill` headcount includes them.
12. **B45** ALL_PRESENT extra pay is multiplied by `DAY_FRACTION[status]` (HALF_DAY gets half the flat amount or multiplier effect). `proposeExtraPayDay` normalises `date` with `dateKeyToDbDate(factoryDateKey(...))`, and a non-`YYYY-MM-DD` input is refused. Tests: HALF_DAY with a flat 500 → 250. The input "13/10/2026" → refused.
13. **B46 payroll close.**
    - `closePayrollPeriod(year, month)`: requires 2000 <= year <= 2100 and 1 <= month <= 12. Refuses the current or a future factory month. Refuses when the preflight has blockers unless `override: { reason >= 3 }` is passed by OWNER. Runs the existence check, compute and write in **one** tx with an advisory lock `payroll-close-YYYY-MM`. Returns `ActionResult`.
    - `payroll/page.tsx` clamps `?year`/`?month`.
    - Tests: month 13 → refused. The current month → refused. Blockers without override → refused. Two concurrent closes → one succeeds, the other gets "already closed".
14. **B47** remove `.catch(() => null)` on the period lookup. Only a "relation does not exist" error is treated as null. Test: a thrown DB error propagates.
15. **B48 extra pay.**
    - `value`: finite, > 0. MULTIPLIER <= 5. FLAT <= 100000.
    - `date`: a valid date key within ±400 days of today.
    - `employeeIds`: exist and are active.
    - Refuse when an APPROVED day already exists for the same date and an overlapping scope.
    - approve/reject: `updateMany where status PENDING`. Count 0 → "Already decided". Reject records `approvedById`/`approvedAt` (as the decider).
    - Tests per rule.
16. **B49** payslip: `month` is clamped to 1..12 and `year` to 2000..2100, else `notFound()`. `getEmployee` is called with a select limited to `name, employeeCode, department` (or use a new minimal reader). Test: `?month=abc` → notFound.
17. **B50** payroll and extra-pay screens: dates via `factory-time.ts` formatters. No `toLocale*` in `src/components/mis/payroll/**` and `extra-pay-propose-screen.tsx` (grep test).
18. **B42 `asResult`** on every export of `employees/actions.ts`, `settings/actions.ts`, `settings/users/**/actions.ts`, `settings/wages/**/actions.ts`, `payroll/actions.ts` and `attendance/extra-pay/actions.ts`. `restoreEmployee`/`restoreItem`-style bare updates get an existence check. One test per file.

## Role matrix tests (mis-permission-matrix)
New `r3-sec-matrix.test.ts`: `describe.each` over the 8 roles × {createEmployee, updateEmployee(wage field), deleteEmployee, getEmployee(out-of-pool), updateBusinessRule(threshold), closePayrollPeriod, proposeExtraPayDay}. Assert allow or `Not permitted: <action>`. Plus the money-key scan (`wage`, `salary`, `amount`, `rate`, `₹`) over every non-OWNER-reachable return value of `getEmployee` and the employees page props. Plus a completeness assert against `MIS_ROLES`.

## Do not touch
`permissions.ts`, attendance register logic, kiosk, `(auth)` (SEC-17 dropped), kit, schema. Keep green: `employee.test.ts`, `employee-slice.test.ts`, `payroll-25.test.ts`, `payroll-figures.test.ts`, `attendance-payroll-rules.test.ts`, `business-rules-schedule.test.ts`, `audit-payloads.test.ts`, `wage-screens.test.tsx`, `documents.test.ts`.

## Risk notes (Opus)
B33 must compare with stored values (an Admin edit form re-posts unchanged fields). B44 changes open-month figures. The payroll close lock must not hold a long tx (compute first? No: the spec requires compute inside; keep it under 10 s and document the measured time). No wage figure may appear in any audit payload.
