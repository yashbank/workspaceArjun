# R3-ORD: Order close/cancel side effects, closed-order guards, BOM integrity, approvals

Backlog: B104-B112. Branch `fix/r3-ord`. **Wave 2** (after R3-WRK is merged: uses `allocation-release.ts`). Model: Sonnet. **Opus reviews** the B104 hunk (stock reservations). Schema: **N**. Estimate: ~110 agent-min.

## Owned files
- `src/server/mis/orders.ts`, `order-desktop.ts`, `bom.ts`, `bom-desktop.ts`, `approvals.ts`, `src/lib/mis/order-transitions.ts`
- `src/app/(mis)/mis/orders/**` (incl. `actions.ts`), `src/app/(mis)/mis/bom/**`, `src/app/(mis)/mis/approvals/**` (incl. `actions.ts`: wraps leave/extra-pay/PO/BOM approval actions *without* changing the server functions they call)
- `src/components/mis/orders/**`, `src/components/mis/bom/**`, `src/components/mis/approvals/**`, `src/components/mis/desktop/order-detail-desktop.tsx`, `bom-desktop.tsx`
- Wave-2 call-site only: `src/components/mis/attendance/leave-screen.tsx` (approve/reject handlers)
- New tests `src/server/mis/r3-ord-*.test.ts`, `src/lib/mis/order-transitions.r3.test.ts`

## Read-only for you
`allocation-release.ts` (call it), `order-allocation.ts` (call its release helper if one exists; otherwise update `MisOrderStockAllocation` rows directly in `orders.ts`), `material-request.ts`, `production.ts`, `qc.ts`, `attendance.ts`, `extra-pay-days.ts`, `po.ts`.

## Items and acceptance
1. **B104 close/cancel side effects.** In `updateOrderStatus`, for the target statuses CANCELLED and COMPLETED (and DELIVERED when coming from a non-COMPLETED status, if the transition table allows it), **inside the same tx as the status CAS write**:
   - (a) `releaseMachineAllocations(tx, <open bookings of the order>, { reason: 'ORDER_CLOSED', actorUserId, at })`, which frees machines and workers.
   - (b) Release open `MisOrderStockAllocation` reservations of the order (read the model: set its released/cancelled marker, or delete if that is the existing release semantics; grep `order-allocation.ts`).
   - (c) For **CANCELLED only**: if the BOM is PENDING_APPROVAL or a material request is open (PENDING/APPROVED-not-issued), refuse unless `options.confirmOpenItems === true`. With confirm, set the BOM back to DRAFT and the open requests to CANCELLED/REJECTED (use the existing terminal status), with an audit row each.
   - The audit `after` includes `{ releasedMachines, releasedWorkers, releasedReservations }` counts.
   - UI: the cancel SlideOver lists the open items and has a "Cancel anyway" confirm.
   - Tests:
     - Cancel with 1 booking + 2 workers + 1 reservation → all released in the same tx (a throw in (b) rolls back the status).
     - Cancel with a pending BOM, no confirm → refused with the list. With confirm → BOM DRAFT.
     - Complete → bookings released.
     - `reopenOrder` unchanged (existing test).
2. **B105** `evaluateCloseGates` gets an **optional** input `productionCount?: number`. When provided and 0, it adds the gate `{ key: 'PRODUCTION_LOGGED', ok: false, label: 'No production has been logged' }`. `computeCloseGates` passes it (count of `MisProductionLog` for the order). The existing callers without the field are unchanged: R3-QCR may import `evaluateCloseGates`, so keep the old signature valid. Tests: zero logs → unmet gate, completing needs the override reason. One log → met. The old call without the field → same result as before.
3. **B106** `updateOrder` and `createBom` (and `addBomStage`/`addBomMaterial` via `requireDraftBom`) refuse when `isOrderClosed(order.status)`: "Order <n> is <status>. Reopen it first." Tests: a DELIVERED order's customer edit → refused. `createBom` on CANCELLED → refused.
4. **B107** `addBomStage` / `addBomMaterial` build the create `data` from **named fields only** (`bomId`/`stageId` come from the validated record, never the input), and apply the update-path validation: name/description non-blank, qty finite > 0, unit non-blank, `itemId` exists and active when given, rate written only with `wages.read` (as today). Test: a payload carrying `bomId` of an APPROVED BOM still writes to the validated DRAFT BOM. Qty 0 → refused.
5. **B108** `submitBomForApproval` / `approveBom` require >= 1 stage, >= 1 material and an open order. Tests.
6. **B109** `deleteBomStage` refuses while any `MisProductionLog`, `MisQcCheck` or `MisJobPhase` references the stage: "Stage is used by N production entries / M QC checks / K phases". Test per reference type.
7. **B110** `getPendingApprovals` drops the `.catch(() => [])`. It returns `{ ..., errors: string[] }` with one entry per failed query (each query in its own try/catch), and the screen shows "Could not load <kind> approvals" instead of an empty state. Test: one query throws → the other two render, plus the error line.
8. **B111** `listOrdersNeedingAction`: `lateRisk`/`daysToDelivery` use `factoryDateKey` differences (no `setHours`). Test: delivery 2026-10-14, now 2026-10-13T20:00Z (01:30 IST on the 14th) → `daysToDelivery` 0.
9. **B112** `orders-screen` Confirm, `order-status-actions` Start production / Mark delivered / Mark complete: handle `ok:false` with a toast showing `detail`, and wrap in try/catch. Every export of `orders/actions.ts`, `bom/actions.ts` and `approvals/actions.ts` returns `ActionResult` (`asResult`). Update every caller of these actions to handle `ok:false`. This includes `approvals-screen` and, **in this wave only**, the approve/reject call sites in `src/components/mis/attendance/leave-screen.tsx` (R3-ATT owned that file in wave 1 and is merged by now; change only those call sites). Grep the callers with `grep -rn "<ActionName>" src/components src/app`. One test per action file plus one UI test for the toast.

## Do not touch
`production.ts`, `job-phases.ts`, `machines-board.ts`, `worker-allocation.ts`, `allocation-release.ts` (call only), `qc.ts`, `permissions.ts`, kit, schema. Keep green: `orders.test.ts`, `orders-status.test.ts`, `orders-numbering.test.ts`, `order-desktop.test.ts`, `bom*.test.ts`, `order-allocation.test.ts`, `approvals-access.test.ts`, `actions-status.test.ts`.

## Risk notes (Opus)
B104 must hold a single tx: status CAS, allocation release and reservation release commit together. Check that `releaseMachineAllocations` is called with the tx client, not `db`. Grep every writer of order `status` (reopen, dashboards) and confirm none bypass the side effects in a way that leaves bookings open (report any found; do not fix outside the owned files).
