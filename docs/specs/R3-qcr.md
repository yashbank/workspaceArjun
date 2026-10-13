# R3-QCR: QC validation, CoA, reports, factory-time ranges, legacy issue report, QC edit (24 h)

Backlog: B72-B84. Branch `fix/r3-qcr`. **Wave 1.** Model: Sonnet. Schema: **N**. Estimate: ~120 agent-min.

## Owned files
- `src/server/mis/qc.ts`, `qc-template.ts`, `qc-grid.ts`, `defects.ts`, `reports.ts`
- NEW `src/lib/mis/qty-by-unit.ts` (pure: `sumByUnit(rows: {qty, unit}[]) -> {unit, qty}[]`, `formatQtyByUnit(...)`). **R3-PRD consumes this in wave 2: freeze its signature in the PR description.**
- NEW `src/lib/mis/qc-verdict.ts` (pure: `latestVerdict(checks)` = latest per (bomStageId, parameterName). Re-use, do not modify, `evaluateCloseGates` from `order-transitions.ts`; if you need its internals, copy the latest-per-key logic into this new file with a comment citing it).
- NEW `src/server/mis/legacy-issues.ts` + page `src/app/(mis)/mis/reports/legacy-issues/page.tsx`
- `src/app/(mis)/mis/qc/**`, `src/app/(mis)/mis/reports/page.tsx`, `src/app/api/mis/reports/**`, `src/app/(mis)/mis/print/coa/**`, `src/app/(mis)/mis/print/qc-checklist/**`
- `src/components/mis/qc/**`, `src/components/mis/reports/**`, `src/components/mis/desktop/qc-grid-desktop.tsx`, `defects-desktop.tsx`, `wastage-desktop.tsx`, `src/components/mis/home/qc-home.tsx`
- New tests `src/server/mis/r3-qcr-*.test.ts`, `src/lib/mis/qty-by-unit.test.ts`, `src/lib/mis/qc-verdict.test.ts`

## Read-only for you
`order-transitions.ts`, `orders.ts` (R3-ORD wave 2), `production.ts`, `job-phases.ts` (R3-PRD wave 2), `print/job-card/**` (R3-PRD), `permissions.ts` (R3-ATT adds SUPERVISOR `qc.write`; your code must gate on `qc.write`, never on a role name).

## Items and acceptance
1. **B72 AQL.** `recordAqlSample`:
   - Refuses `sampleSize` that is not an integer >= 1.
   - Refuses `sampleSize` below the required size for the lot (from `evaluateAql`'s table), with the message "Sample too small: inspect at least N".
   - Refuses any defect qty < 0 or non-finite, and unknown `defectTypeId` ("Unknown defect type").
   - The UI no longer sends `Number(x) || 0`: blank → the client error "Enter the sample size".
   - Tests:
     - sample 0 → refused, no `MisQcCheck` row.
     - sample below required → refused.
     - Unknown defect id → refused.
     - A valid sample still writes PASS/FAIL as today.
2. **B73 QC check validation** (`addQcCheck`, `recordChecklistCheck`):
   - `result` in {PASS, FAIL, NA} (read the actual set used by the grid). `defectQty` is null or finite >= 0.
   - FAIL requires `defectType` or notes >= 3 chars.
   - `bomStageId` (when given) belongs to the order's BOM.
   - The order exists and is not closed (`isOrderClosed`). Otherwise typed friendly errors, never a raw FK error.
   - Tests one per rule, incl. a CANCELLED order refused and a stage from another order refused.
3. **B84 edit a QC check within 24 h.**
   - `editQcCheck(id, patch)`: `qc.write`. The patch may contain `result`, `defectType`, `defectQty`, `notes`, `parameterName`, validated as item 2.
   - Allowed only when `now - createdAt <= 24 h`, the check is not acknowledged (`acknowledgedAt` null), and the order is not closed. Otherwise "This check can no longer be edited (24 h / acknowledged / order closed)".
   - Audit `QC_CHECK_EDIT` before/after.
   - UI: an "Edit" action on rows in `qc-detail-screen` for `qc.write` holders while editable.
   - Tests:
     - 23 h 59 m → OK.
     - 24 h 01 m → refused.
     - Acknowledged → refused.
     - QC role OK; WORKER forbidden.
     - The audit row has before/after.
4. **B74 CoA verdict.** `print/coa/[id]/page.tsx` "Overall Result" = FAIL only if `latestVerdict` has any key whose latest check is FAIL. An earlier FAIL followed by a later PASS on the same stage+parameter is resolved. AQL "AQL Sample" checks follow the same rule. All N/A → "N/A". Tests:
   - Fail 09:15 then pass 10:15 → PASS.
   - Fail on param A plus pass on param B → FAIL.
   - No checks → "N/A — no checks recorded".
5. **B75** CoA: remove `.catch(() => [])` on `getQcForOrder` and similar. A load error reaches the print `error.tsx` boundary (create `print/coa/[id]/error.tsx` if missing, text "Could not load QC data — do not issue this certificate"). Test: a mocked throw renders the error boundary, never "No quality checks recorded".
6. **B81 CoA content.** Dates via `formatFactoryDate`/`formatFactoryDateTime`. Shows order status. When the status is not COMPLETED/DELIVERED, a red banner "DRAFT CERTIFICATE — order is <status>". Test per status.
7. **B76 units.**
   - `sumByUnit` groups by the normalised unit (trim, upper-case), with 2 dp.
   - `getProductionReport` and the wastage report return per-unit totals (`totals: {unit, produced, waste}[]`) instead of one mixed figure.
   - Waste % is computed per unit.
   - The reports screen prints the unit on every row.
   - Tests:
     - 500 PIECE + 200 KG → two rows, never "700".
     - The same unit in different case → merged.
8. **B77 month range.** The reports page builds `from = dateKeyToDbDate('YYYY-MM-01')` in factory terms and `to = next month start`, half-open (`lt`). All `reports.ts` range filters use `gte from, lt to`. Tests: a log at 2026-09-30T19:00Z (01:00 IST on Oct 1) is in October. A log at 2026-10-31T18:00Z (23:30 IST on Oct 31) is in October.
9. **B78** `?year`/`?month` are clamped (2000..2100, 1..12, default = factory current month). Each report section loads with its own try/catch and renders an inline "Could not load <section>" while the others still render. Test: one report throws, the others render.
10. **B79** pass rate = pass / (pass + fail). N/A is excluded and shown as "N/A: n". No checks → "—". `getQcSummary.totalDefectQty` label reads "Defects (failed checks)". Test: 8 pass + 2 NA → 100%.
11. **B80** `print/qc-checklist`: a `?date` after the factory today is clamped to today, with a note. An unknown or inactive `?template` → a banner "Template not found — choose one" and no checklist printed (no silent `templates[0]`). Tests.
12. **B82 `asResult`** on every export of `qc/actions.ts` (incl. `addQcCheckAction`, `recordAqlSampleAction`, checklist actions). `qc-screen`, `qc-detail-screen` and the AQL form show `result.error` inline. One test per action.
13. **B83 legacy unkeyed issues report (read-only, no data change).**
    - `listLegacyStoreIssues()`: `requirePermission('inventory.read')` AND `reports.read`. Reads `MisInventoryLedger` where `source = 'STORE_ISSUE'` and (`sourceId` is null OR `sourceId` matches no `MisOrder.id`). Ordered by `createdAt`.
    - Returns: date (factory), item code + name, quantity, balance after, created by (name), notes, and the `referenceNo` of a matching store txn if one exists. **No price, rate or value fields.**
    - Page `/mis/reports/legacy-issues`: a table, a count in the header ("N legacy issues not linked to an order"), an explanation line "Read-only: these rows predate order-linked issuing and are not counted in traceability", and a CSV download (client-side from the returned rows).
    - A link to it from the reports screen for holders of both permissions.
    - Tests:
      - A row with null sourceId is listed; a row keyed to an existing order is not.
      - The money-key scan over the result is clean.
      - STORE_GUY lacks `reports.read` → forbidden. OWNER/ADMIN allowed.
    - In the PR, state the live count from a read-only `SELECT count(*)` (the owner expects 36).
14. **X2** no `toLocale*` in `src/components/mis/qc/**`, `reports/**`, `print/coa/**`, `print/qc-checklist/**` (grep test).

## Do not touch
`order-transitions.ts`, `orders.ts`, `production.ts`, `job-phases.ts`, `print/job-card`, `permissions.ts`, schema, kit. Keep green: `coa-print.test.tsx`, `qc-grid-desktop.test.tsx`, `defects.test.ts`, `machine-utilisation-report.test.ts`, QC template tests.

## Risk notes
CoA output changes for orders with resolved failures (now PASS). That is correct, but tell the owner. Report totals change shape (per unit); check the dashboard/widgets that call `getProductionReport` still compile (grep callers; adapt callers only within your owned files, else keep a backward-compatible `total` field marked deprecated).
