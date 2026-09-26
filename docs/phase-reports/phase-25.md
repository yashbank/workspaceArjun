# Phase 25 · Payroll rules from Arjun's review

**Date:** 2026-09-22 (Half A) / 2026-09-26 (Half B)   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-216 family (no other ticket). Findings: F-33 (payroll screen vs W9) — CLOSED in Half B.

## What was built (Half A — schema.prisma + migrations-pending only)

Read first: `DEVELOPMENT_GUIDE.md` §1A/§2A/Phase 25's own stamp history, `MIS_UI_SPEC.md`, `DECISIONS.md` D24–D28 and D32, `PHASE_LOG.md` tail, `phase-reports/phase-24.md`, `qa/FINDINGS.md` (F-33). Today's app currently prices EVERY employee off one global default wage code (`DEFAULT_DAILY_WAGE_CODE` in `payroll.ts`) — there is no per-employee wage-code link at all, which is the first gap 25.2 requires closing.

- `prisma/schema.prisma`:
  - **`MisEmployee`** — added `wageTypeCode` (nullable, a CODE not an FK — see D33), `payType` (`MisPayType` enum, default `DAILY`), `sundayPaid` (Boolean, default false). D28/25.3.
  - **`MisWageType`** — added `otRatePerHour` (nullable Decimal, D26's per-hour OT rate), `multiplierBasis` (`MisPayBasis` enum, default `PER_MONTH`, D28), and three component base amounts: `hraAmount`, `allowanceAmount`, `bonusAmount` (all nullable Decimal, 25.1). Effective-dated for free — they ride the existing `(code, effectiveFrom)` row.
  - **`MisEmployeePayComponent`** (new) — one row per (employee, component) toggle. `component` is `MisPayComponent` (BASIC/HRA/ALLOWANCE/OT/BONUS). Not effective-dated (D33) — a closed month is protected by the new snapshot below, not by this row's own history.
  - **`MisExtraPayDay`** (new) + **`MisExtraPayDayEmployee`** + **`MisExtraPayDayDepartment`** (new join tables) — 25.4/D28. `kind` (MULTIPLIER/FLAT_AMOUNT), `value`, `scope` (ALL_PRESENT/EMPLOYEES/DEPARTMENTS), `status` (PENDING/APPROVED/REJECTED) reusing the existing approval-queue PATTERN (a status field, like `MisBom`/`MisPurchaseOrder`/`MisLeaveRequest`) rather than a new generic mechanism, `proposedById`, `approvedById`/`approvedAt`.
  - **`MisPayrollPeriod`** (new) + **`MisPayrollSnapshotLine`** (new) — the missing half of D27: "a computed month is NOT final". One period row per (year, month); closing it writes one snapshot line per employee (denormalised name/code/payType on purpose) and flips `status` to CLOSED. `correctionsAfterClose` and `lastExportedById`/`lastExportedAt` back W9's "Corrections after close: 0" and "Export August" / "every export is logged with who and when".
  - Five new enums: `MisPayType`, `MisPayBasis`, `MisPayComponent`, `MisExtraPayKind`, `MisExtraPayScope`, `MisExtraPayStatus`, `MisPayrollPeriodStatus`.
  - **No TypeScript references any of this yet**, per the schema-gate rule.
- `prisma/migrations-pending/20260926000000_mis_payroll_rework/migration.sql` — idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object` for enums, matching the existing convention), FKs to `mis_employees`/`mis_departments`/the two new parent tables, indexes on the lookup paths Half B will need (`wage_type_code`, `date`+`status` on extra-pay days, `employee_id` on the snapshot), full rollback block.
- `docs/DECISIONS.md` — **new D33**, recording five schema-shape choices the 25.1–25.5 brief left open (component toggles not effective-dated; the wage-code link is a code, not an FK; "Salary" is a display label on `payType`, not stored data; extra-pay days reuse the approval PATTERN, not a shared table; multiplier basis lives on the wage code, not the employee) so Half B does not re-decide any of them differently.

**Verify:** `node_modules/.bin/tsc --noEmit --skipLibCheck` prints nothing (schema-only change; nothing yet references the new models). No vitest/build run — nothing to test.

## Decisions cited

D24 (wages/money — every new money column and the whole snapshot table are Owner-only; the migration comment tells Half B to extend the audit redaction list, never write a snapshot line, extra-pay value, OT rate or component amount into a `before`/`after` payload). D26 (OT rate per hour on the wage code). D27 (rate-as-of-day pricing; this phase builds the still-missing "closed month stays closed" half). D28 (extra-pay days, multiplier basis). **New: D33** (schema-shape choices, above).

## What changed for later phases

None yet — Half B is the next session on Phase 25 itself, not a different phase.

## The gate (done)

Human ran, from `Arjun/app`:
```bash
mv prisma/migrations-pending/20260926000000_mis_payroll_rework prisma/migrations/20260926000000_mis_payroll_rework
pnpm db:deploy && pnpm db:generate
```
Confirmed applied — the generated client carries all five new models.

## What was built (Half B — server + screens, phase complete)

**Server (`src/server/mis/`):**
- `pay-basis.ts` (new, `src/lib/mis/`) — pure arithmetic: `perDayRate` (a MONTHLY code's `amount` divided by that month's own day count, so it pays the same total whatever the month length), `otPayForDay` (D26: a code's `otRatePerHour` if set, else the pre-D26 multiplier shape — unchanged behaviour for anyone not yet assigned a code), `extraPayMultiplierUnit` (D28/25.5: which figure a MULTIPLIER extra-pay day multiplies).
- `wage-type.ts` — extended with `otRatePerHour`, `multiplierBasis`, `hraAmount`/`allowanceAmount`/`bonusAmount`. **`getWageRateHistory` was left at its exact original shape** (`{effectiveFrom, amount}`) because `payroll-figures.test.ts` pins it with `toEqual` — a new `getWageTypeRowsForCodes(codes[])` batches the FULL rows payroll needs, one query for every distinct code a run uses (§2A.13 — never one query per employee).
- `employee.ts` — `wageTypeCode`/`payType`/`sundayPaid` on create/update. **Found while wiring:** the whole row already goes into the audit payload here; `wageTypeCode`'s literal key name contains "wage" and `audit-payloads.test.ts` refuses that substring anywhere, no exceptions — added `auditSafeEmployee()` that strips just that one key before every `logAuditEvent` call in this file (disclosed below).
- `pay-components.ts` (new) — `getPayComponents`/`getPayComponentsForEmployees` (batched)/`setPayComponent`, `wages.read`. Un-set = enabled (a template starts full-on; a toggle is an explicit opt-out).
- `extra-pay-days.ts` (new) — `proposeExtraPayDay` (`attendance.write` — D28 names Admin/Super Attendance Operator explicitly, and writing isn't gated the same as reading, the F-15 precedent), `approveExtraPayDay`/`rejectExtraPayDay`/`listExtraPayDays`/`listApprovedExtraPayDaysForMonth`/`countPendingExtraPayDays` (`wages.read`). The value/multiplier is never in an audit payload for any action here (matches how `business-rules.ts` already omits a wage rule's value, F-04).
- `payroll-period.ts` (new) — `getPayrollPeriod`, `getPayrollPreflight` (W9's checklist from real data: `misAttendance.count` for unapproved clock-outs, `misLeaveRequest.count` for open leave, `misEmployee.count` for missing pay codes), `closePayrollPeriod` (snapshots `calculateMonthlyPayroll`'s live figures into `MisPayrollSnapshotLine`, flips the period CLOSED, audits the period + a line COUNT, never a figure), `recordPayrollCorrection` (explicit, Owner-typed — automatic back-dated-write detection across every wage-adjacent writer was out of scope for this phase, noted honestly rather than half-built), `recordPayrollExport`.
- `payroll.ts` — rewritten. `calculateMonthlyPayroll` now: checks the period first and reads the FROZEN snapshot if CLOSED (D27's missing half, finally built); otherwise computes live, per employee, at THEIR OWN wage code (falling back to the historic global default for anyone with none — unchanged numbers for every employee this phase didn't touch, confirmed against `payroll-figures.test.ts`'s exact pinned figures, which still pass byte-for-byte); folds in HRA/Allowance/Bonus (component-toggle-gated, resolved as of the period's last day), OT via the new D26 path, a MONTHLY employee's Sunday pay (every Sunday in the month is a paid day even with no attendance row — the common case, since nobody clocks in on a day off), and approved extra-pay days (additive with OT, never absorbing it).
- `approvals.ts` — `getPendingApprovals` folds in `extraPayDays`, but ONLY when the caller already holds `wages.read` — every other role sharing the endpoint (Admin, Supervisor, QC all hold `orders.read`) gets an empty array, never a redacted one (D24).
- `audit.ts` — `REDACTED_KEYS` extended with the rework's own money field names, as defence in depth (every writer already keeps them out of its own payload on purpose).

**Screens:**
- `/mis/payroll` rebuilt to W9 (closes F-33): month card (Open/Closed, counts only), "Before export" checklist, "Export contains… no rates and no amounts" card, Export button (CSV of counts, `recordPayrollExport`), Close-this-month (confirmed, `closePayrollPeriod`). **Found while rebuilding — a real leak:** the old page passed the FULL `calculateMonthlyPayroll` rows (including every money field) to the client screen even though the screen only rendered some of them — a value the screen doesn't draw is still sent, the same F-06 lesson `withoutMoneyFields` exists for. The page now strips every money field server-side before the props are built; `payroll-screen-no-money.test.ts` (new, source-scan) and `wage-screens.test.tsx` (`moneyFreeForAll: true`, edited — disclosed) pin it.
- `/mis/print/payslip/[employeeId]` — six named rows (BASIC prints "Salary" for MONTHLY, "Basic Wage" for DAILY — a label switch on `payType`, D33; HRA/Allowance/OT/Bonus/Extra pay each only when > 0; Late Penalty; NET SALARY).
- `/mis/settings/wages` (`wage-type-screen.tsx`) — OT rate/hour, multiplier basis (DAILY codes only), HRA/Allowance/Bonus amounts on both the create and add-rate forms; new columns on the list.
- `/mis/employees` — wage-code picker (`WagePicker`, reused), Pay type, Sunday-paid checkbox, all inside an Owner-only "Pay setup" block (`isOwner` from the page; `wageTypeCode` is not money itself, but the picker's OPTIONS come from `listWageCodes`, `wages.read`, so an Admin sees no options and the block is gated the same way). A missing wage-code note surfaces inline (25.1's data-health rule).
- `/mis/employees/[id]` — an Owner-only "Payslip rows" card, five checkboxes wired to `getPayComponents`/`setPayComponent`.
- `/mis/attendance/extra-pay` (new route) — the propose form (date, kind + value, scope, reason). **Scope note:** DEPARTMENTS is not offered — Super Attendance Operator (one of D28's two named proposers) holds `attendance.write` but not `masters.read`, so a department picker would fail to load for them; ALL_PRESENT and EMPLOYEES both resolve through `employees.read`, which every proposer holds. The BE fully supports DEPARTMENTS already (tested); only the picker is deferred.
- `/mis/approvals` — a fourth section, Owner-only, Approve/Reject on each pending extra-pay day.

## Disclosed test edits (existing tests, not new ones)
- `wage-screens.test.tsx`: the "payroll page" entry gained `moneyFreeForAll: true` (W9's own design removes money from this screen for every role, Owner included) and the wage-module importer registry gained `employees/page.tsx` (its new, reviewed, gated `listWageCodes` call).
- `employee-slice.test.ts`: both money-name-scanning tests gained narrow, commented allow-lists for `wageTypeCode`/`payType`/`payComponents` (not money — D33) and the new genuinely-money `MisWageType`/`MisPayrollSnapshotLine` columns.
- `audit-payloads.test.ts`: the `auditSafe()` key list gained `multiplierBasis` (a basis flag, not money).
- `wage-leak.test.ts`: one of F-05's two `it.fails` markers (the payroll-field-name case) now passes for real — flipped to an ordinary test, per this codebase's own "a flip is the fix landing" convention. The other (`redact()` doesn't recurse into nested objects) is still open, unchanged.
- `approvals-access.test.ts`: seeded a `misExtraPayDay` row so the new gate is actually exercised rather than accidentally satisfied by a missing-mock exception; the blanket `total: 3` assertion is now `4` for a `wages.read` holder.

## Verification, honestly
`tsc --noEmit --skipLibCheck`: **silent**. `pnpm vitest run`: **187 files, 4149 passed + 9 expected-fail** (Half A / pre-Half-B baseline: 172 files, 3868 passed + 10 — the F-05 flip explains the expected-fail count dropping by one). `pnpm build`: **passes**, every route including the new `/mis/attendance/extra-pay`. Ran once, at the end, after the whole batch was internally consistent — not after each file (see the new `mis-fast-phase` skill this session added).
**Not built / left honest:** automatic detection of a back-dated write into a CLOSED period (`recordPayrollCorrection` is manual/explicit, noted in its own comment); DEPARTMENTS scope's picker; the payroll screen's own attendance-only table still degrades to a plain `<table>` below `lg` rather than the kit `DataTable`'s card layout (money-free, so lower stakes than the F-26 cases that prompted the rule).

## What changed for later phases
None — Phase 25 is complete; nothing here changes a later phase's own section.

## Pending
None for Phase 25 itself. Standing, unrelated to this phase: F-15, D29–D32 questions for Arjun; Session B's own track (15–18, 22).

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-25.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/design/screens/W9-Payroll-export.png
