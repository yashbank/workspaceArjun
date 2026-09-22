# Phase 25 · Payroll rules from Arjun's review

**Date:** 2026-09-22   **Model:** sonnet   **Result:** Half A complete — awaiting migrate
**Tickets:** MIS-216 family (no other ticket). Findings: F-33 (payroll screen vs W9) — not yet closed, waits for Half B.

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

## Pending — the next agent must do this first

**The gate.** Human runs from `Arjun/app`:
```bash
mv prisma/migrations-pending/20260926000000_mis_payroll_rework prisma/migrations/20260926000000_mis_payroll_rework
pnpm db:deploy && pnpm db:generate
```
Then confirm: `grep -n "model MisPayrollSnapshotLine" prisma/schema.prisma` and a quick look at `src/generated/prisma/models.ts` for the new models, per the `mis-schema-gate` skill.

Then **Half B** (new session): build 25.1 (component toggle UI + payslip rows), 25.2 (OT-per-hour calc, replacing `OT_MULTIPLIER` for any employee on a code that sets `otRatePerHour`), 25.3 (pay-type/Sunday pay in `calculateMonthlyPayroll`), 25.4 (extra-pay-day CRUD + a fourth `getPendingApprovals` kind + Owner-approve wiring), 25.5 (multiplier-basis-aware extra-pay calc), the period-close flow (`closePayrollPeriod`, snapshot-writing, every reader switching to the snapshot once CLOSED), and the payroll screen rebuilt to `W9-Payroll-export.png` (closes F-33 — counts only in the export, no rates/amounts, the pre-flight checklist including "N employees have no wage type set" as a data-health finding per the existing pattern). Every new/changed server function needs `wages.read` and an 8-role refusal test (D24; Phase 14F closed exactly this leak once already — do not reopen it). Test the extra-pay-day + OT overlap on one day, and a month containing five Sundays for both pay types (25.3's own instruction).

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-25.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/design/screens/W9-Payroll-export.png
