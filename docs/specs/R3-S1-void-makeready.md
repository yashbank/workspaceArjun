# R3-S1: Void production log / QC check, makeready minutes (schema)

Backlog: B128, B129. Branch `feat/r3-s1-void-makeready`. **Wave 3.** Model: Sonnet. **Opus reviews the diff** (totals + schema). Schema: **Y** (file 1 of R3-S0). Estimate: ~120 agent-min.

## Start condition (hard; mis-schema-gate Half B)
1. The owner has applied `20261014000001_r3_production_void_makeready/apply-in-sql-editor.sql`, and the verify SELECT returned 5 rows (recorded in `docs/COMPLETION_TRACKER.md`).
2. Step SG is merged into `phase-a` (schema.prisma has `voidedAt`/`voidReason` on `MisProductionLog` and `MisQcCheck`, and `makereadyMinutes` on `MisProductionLog`).
3. In your worktree: `pnpm install && pnpm db:generate`, then `grep -n "voidedAt" src/generated/prisma/models/MisProductionLog.ts` finds it. If any of these fail, **STOP and report**: no `any`, no raw SQL workaround.

## Owned files (wave 3; the wave-1/2 owners are merged)
- `src/server/mis/production.ts`, `job-phases.ts`, `qc.ts`, `qc-template.ts`, `qc-grid.ts`, `defects.ts`, `reports.ts`, `traceability.ts`, `traceability-view.ts`, `order-desktop.ts`, `orders.ts` (**only** `computeCloseGates` and any production/QC read in it), `dashboard.ts` (only production/QC reads), `machines-board.ts` (only `lastLog`/`syncFlag` reads)
- NEW `src/lib/mis/void.ts` (pure): `NOT_VOIDED = { voidedAt: null } as const`, `canVoid(...)`, `VOID_REASON_MIN = 3`
- `src/app/(mis)/mis/production/**`, `src/app/(mis)/mis/qc/**`, `src/app/(mis)/mis/print/job-card/**`, `src/app/(mis)/mis/print/coa/**`, `src/app/(mis)/mis/orders/[id]/page.tsx`, `src/app/(mis)/mis/qc/grid/page.tsx`
- `src/components/mis/production/**`, `src/components/mis/qc/**`, `src/components/mis/traceability/traceability-screen.tsx`, `src/components/mis/orders/order-detail-screen.tsx` (production/QC lists only), `src/components/mis/desktop/qc-grid-desktop.tsx`, `order-detail-desktop.tsx` (lists only)
- New tests `src/server/mis/r3-s1-*.test.ts`, `src/server/mis/void-coverage.test.ts`

## Items and acceptance
1. **Void a production log.**
   - `voidProductionLog(id, reason)` (`production.write`): reason trimmed >= 3 chars. Refused when already voided, when the log's phase is SIGNED_OFF ("Reopen the phase first"), or when the order is closed.
   - Sets `voidedAt = now`, `voidReason`. Audit `PRODUCTION_LOG_VOID` with before/after (quantities, reason; no money).
   - A voided log cannot be edited (`editProductionLog` refuses) or un-voided (no un-void in R3).
   - Tests: happy path; reason "ab" → refused; signed-off → refused; double void → refused; edit after void → refused; WORKER/QC forbidden.
2. **Void a QC check.**
   - `voidQcCheck(id, reason)` (`qc.write`): same rules (closed order → refused). Additionally a check with `result = 'FAIL'` can be voided **only by ADMIN/OWNER** (role from the actor), so a supervisor/QC cannot clear a failure by voiding it. An acknowledged FAIL → only ADMIN/OWNER.
   - Audit `QC_CHECK_VOID`.
   - Tests: QC voids a PASS → OK. QC voids a FAIL → forbidden-style error "Only Admin or Owner can void a failed check". ADMIN voids a FAIL → OK, and the close gate re-evaluates.
3. **Voided rows drop out of every total.** Every Prisma read of `misProductionLog` / `misQcCheck` that **aggregates, counts, sums, decides a gate or prints a certificate** adds `...NOT_VOIDED`. This includes:
   - production summary/series/day summary/report
   - sign-off summary and the waste-reason gate (a voided log needs no reason)
   - close gates (`computeCloseGates`: production count + QC verdict)
   - QC summary / today board / recent failures / grid / defects
   - CoA verdict, job card totals, traceability, dashboard widgets, machine-board `lastLog`
   Lists shown to people (production detail, QC detail) **include** voided rows, rendered struck-through with "Voided: <reason> · <who> · <factory time>" (who = from the audit row or the actor name resolved at void time; no new column).
   - **Coverage test** `void-coverage.test.ts`: scans `src/server/mis/**/*.ts` and `src/app/**/*.tsx` (excluding tests) for `misProductionLog.` / `misQcCheck.` / `productionLogs` / `qcChecks` reads and fails unless the same call expression is followed by `NOT_VOIDED` or `voidedAt` within the `where`, or the file:line is in an explicit allow-list with a reason (e.g. "detail list shows voided"). Keep the allow-list in the test file.
   - Behaviour tests: an order with logs 100 + 50 where the 50 is voided → summary 100, report 100, job card 100, CoA unaffected by a voided FAIL, close gate "production logged" fails when the only log is voided.
4. **Makeready minutes (optional).** The production form gets "Makeready (minutes)" (integer 0..1440, blank = null) on create and edit. The server validates it. It is shown on the production detail row and on the job card per phase (sum). The production report gets a "Makeready min" total per order. It is not part of any qty total. Tests: 1441 → refused; blank → null; the job card shows the sum.
5. **Offline replay** carries `makereadyMinutes` as an optional payload field (old queued payloads without it still apply). Test: an old payload is replayed unchanged.
6. UI: "Void" (with a reason SlideOver, `useConfirm`) on production and QC rows for permitted roles while voidable. Struck-through rendering. Component tests for both.

## Do not touch
`schema.prisma` (SG did it), SQL files, `idempotency.ts` core, `permissions.ts`, worker/machine allocation logic, kit. Keep the full existing suite green. Any existing test whose fixture now needs `voidedAt: null` gets it added with a comment "R3-S1 fixture field", with no expectation changes.

## Risk notes (Opus)
Missed readers inflate totals (backlog risk 14): review the coverage allow-list line by line. A FAIL void must not be a back door around the close gate (item 2). Ensure `include` selects of logs/checks in pages do not leak `voidReason` to roles that cannot see the order (same gate as the row).
