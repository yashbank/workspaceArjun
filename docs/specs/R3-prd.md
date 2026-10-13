# R3-PRD: Production entry, phases, offline queue, clearance, job card, edit (24 h)

Backlog: B113-B127. Branch `fix/r3-prd`. **Wave 2** (after R3-WRK and R3-QCR are merged: uses `allocation-release.ts`, `machine-sync.ts`, `getCrewForOrder`, `presence.ts`, `qty-by-unit.ts`). Model: Sonnet. Schema: **N**. Estimate: ~130 agent-min.

## Owned files
- `src/server/mis/production.ts`, `job-phases.ts`, `idempotency.ts`, `queue-resolve.ts`, `line-clearance.ts`, `src/lib/mis/production-form.ts`
- `src/app/(mis)/mis/production/**` (incl. `actions.ts`, `sign-off/**`), `src/app/(mis)/mis/queue/**`, `src/app/(mis)/mis/print/job-card/**`
- `src/components/mis/production/**`, `src/components/mis/queue/**`
- New tests `src/server/mis/r3-prd-*.test.ts`. Extend (do not rewrite) `job-phases.release.test.ts`: add `misWorkerAllocation` to its mock **only** by adding new `it` blocks. If the existing mock setup must change, add a comment citing B118.

## Read-only for you
`allocation-release.ts`, `worker-allocation.ts` (`getCrewForOrder`), `machines-board.ts`, `lib/mis/machine-sync.ts`, `lib/mis/presence.ts`, `lib/mis/qty-by-unit.ts`, `orders.ts`, `order-transitions.ts`, `qc.ts`, `permissions.ts`.

## Items and acceptance
1. **B118 sign-off frees the crew.** In `signOffPhase`, replace the machine-only release with `releaseMachineAllocations(tx, heldIds, { reason: 'PHASE_SIGNED_OFF', actorUserId, at: signedOffAt })`. `reopenPhase` does not re-lock. Test (new `it` in `job-phases.release.test.ts` or a new file): sign-off releases 1 booking and its 4 worker rows with `releasedAt = signedOffAt`. Already-released rows keep their stamp.
2. **B113** `assertOrderOpen` also refuses DRAFT (and any pre-confirmation status in the real enum) with the parkable reason `ORDER_NOT_STARTED` ("Order <n> is not confirmed yet"). Add it to the parkable set without editing other reasons. Tests: live submit on DRAFT → refused. Offline replay → PARKED with ORDER_NOT_STARTED. CONFIRMED and IN_PRODUCTION accepted.
3. **B114** `runIdempotent`: when the existing row has `resolvedAt` set, return its stored verdict (or REJECTED `RESOLVED` with the resolution note) and **never apply**, regardless of `retry`. `discardParkedWrite` sets `status: 'REJECTED'` as well as `resolvedAt`. Tests: discard, then retry with a retryable park reason → not applied, and no production row is created.
4. **B115** `setWasteReason`: unknown id → typed not-found. Refused when the log's phase is SIGNED_OFF ("Reopen the phase to change a signed record"). Audit has before/after reason. Test.
5. **B116** `acknowledgeQcFailure`: allowed for the check's phase in-charge, or for OWNER/ADMIN with `note` >= 3 chars. Refused on closed orders. Tests: a non-in-charge SUPERVISOR → refused. ADMIN without a note → refused, with a note → OK.
6. **B117** `planPhases`:
   - Every `processId` exists and is active. Every `bomStageId` belongs to the order's BOM. No duplicate (process, stage) pair. At least one `applies:true`. The order is not closed.
   - The "already planned" count + `createMany` run inside one tx with an advisory lock `plan-phases-<orderId>`.
   - Tests:
     - Each validation case.
     - Two concurrent plans → one plan (no duplicate sequences).
     - All `applies:false` → refused.
7. **B119** `getDayProductionSummary(day)` uses factory date-key bounds (like `getProductionSeries`). Test: a log at 2026-10-13T19:00Z counts for Oct 14 IST.
8. **B122 operator and shift on a log.** `createProductionLog`/`toLogInput`:
   - When `employeeId` is given, it must exist, be active and be non-deleted, else "Operator not found".
   - Result `warnings` includes `NOT_ON_CREW` when the employee has no open worker row (parent booking open) for that machine on the factory date.
   - `shiftId`: payload value if given and active; else the shift whose window contains `loggedAt` in the factory tz (reuse the existing shift-view helper; grep `shift-view.ts`); else null.
   - The production form lists the booking's crew first, labelled "On this machine", then the rest.
   - Tests:
     - An inactive operator → refused.
     - An operator not on the crew → logged plus a warning.
     - `shiftId` resolved at 10:00 to the day shift.
     - Crew-first ordering in `operatorOptions`.
9. **B123 machine/booking warning.** After a successful log, `classifyLogAgainstBookings` runs on the order's and the machine's bookings. `NO_BOOKING` / `OTHER_ORDER` → `warnings` entry plus an amber note on the form ("Coater 1 is booked for ORD-12, not this order"). Never blocks; the offline replay ignores warnings. Tests: 3 outcomes.
10. **B124 units.** `getProductionSummary`, `getProductionForOrder` totals, `getSignOffSummary` and `production-detail-screen` use `sumByUnit`. No mixed-unit sum anywhere. Hard-coded "kg" is removed. Tests: 500 PIECE + 200 KG → two totals. Waste % per unit.
11. **B125 job card.**
    - Remove `.catch(() => 0)` / `.catch(() => null)`: a load error reaches `print/job-card/[id]/error.tsx` (create it: "Could not load the batch record — do not print").
    - Per-unit totals (item 10).
    - A "Crew" line per phase from `getCrewForOrder` (names + codes, shift, date; released people marked "(released)").
    - All dates via `factory-time.ts` formatters.
    - Tests: extend with new `it`s next to `job-card-bpr.test.tsx` (new file `job-card-r3.test.tsx`): crew line present, error boundary on throw, no `toLocale` (grep test).
12. **B126 edit a production log within 24 h.**
    - `editProductionLog(id, patch)` (`production.write`). The patch may contain `qtyProduced`, `qtyWaste`, `wasteReason`, `unit`, `machineId`, `employeeId`, `bomStageId`, `notes`, with the same validation as create (stage in BOM, operator active, qty finite >= 0, waste <= produced).
    - Allowed only when `now - loggedAt <= 24 h`, the phase is not SIGNED_OFF, and the order is not closed. Otherwise "This entry can no longer be edited (24 h / signed off / order closed)".
    - Audit `PRODUCTION_LOG_EDIT` before/after (quantities only).
    - UI: an "Edit" button per row in `production-detail-screen` while editable.
    - Tests:
      - 23 h 59 m OK, 24 h 01 m refused.
      - Signed-off → refused.
      - WORKER/QC forbidden; SUPERVISOR allowed.
      - Totals reflect the edit.
13. **B120** `production-detail-screen`:
    - Hides "+ Log Production" on closed orders with the note "Order is <status>".
    - The default date is `factoryDateKey(now)` (no `todayIso()`/UTC).
    - Client checks qty finite > 0, waste >= 0 and waste <= produced before submit.
    - Component tests.
14. **B121** `assertLineCleared`: takes the log's `orderId`. In JOB mode a clearance whose `orderId` differs from the log's order is not valid even when the machine has no booking. An inactive or deleted machine → refused. Tests.
15. **B127** every export of `production/actions.ts`, `production/sign-off/**/actions.ts` and `queue/actions.ts` returns `ActionResult` (`submitProductionLog`'s existing contract stays). The callers handle `ok:false`. One test per file.

## Do not touch
`machines-board.ts`, `worker-allocation.ts`, `allocation-release.ts`, `orders.ts`, `qc.ts`, kiosk, `permissions.ts`, schema, kit. Keep green: `job-phases.test.ts`, `job-phases.gate.db.test.ts`, `idempotency.test.ts`, `line-clearance.test.ts`, `production*.test.ts`, `job-card-bpr.test.tsx`, `machine-day-timeline.test.ts`.

## Risk notes
B113 parks queued DRAFT entries (backlog risk 12). B114 changes the replay semantics of discarded rows: make sure an APPLIED row's duplicate still returns APPLIED. The sign-off tx gains writes: confirm it stays one tx.
