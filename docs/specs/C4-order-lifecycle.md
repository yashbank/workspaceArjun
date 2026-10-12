# C4 — Order lifecycle: close / complete / deliver / cancel with gates

Items: #31 #32. Branch `fix/c4-order-lifecycle`. NOTE: the tester wrote "COMPLETE"; the real closed statuses are `COMPLETED`, `CANCELLED`, `DELIVERED` (`src/lib/mis/order-status.ts`). Reading the actual status enum FIRST is mandatory.

## Files (grep symbols)
- `src/server/mis/orders.ts` — `updateOrderStatus(id, status: string)` (~93-100: any string, no transition check), `reopenOrder` (~140; reason + audit pattern to reuse), `orders/actions.ts` (~12 exposes it).
- `src/lib/mis/order-status.ts` (`isOrderClosed`, `CLOSED_ORDER_STATUSES`), `src/server/mis/job-phases.ts` (`assertTransition` pattern for phases; `getPhasesForOrder`), production/QC read functions for produced qty and QC results.
- UI: `src/components/mis/orders/orders-screen.tsx` (~87-88 only Confirm), `order-detail-screen.tsx` (Reopen only), `src/components/mis/desktop/order-detail-desktop.tsx` (D4 twin: keep both in step).

## Acceptance
1. A pure, tested transition table in `src/lib/mis/` (new file `order-transitions.ts`): read the real status enum and derive: DRAFT -> CONFIRMED | CANCELLED; CONFIRMED -> IN_PRODUCTION | CANCELLED; IN_PRODUCTION -> COMPLETED | CANCELLED; COMPLETED -> DELIVERED | IN_PRODUCTION (reopen); DELIVERED and CANCELLED terminal (CANCELLED may be reopened only via the existing reopen if that exists today). If the real enum differs, adapt and document the table in the file header.
2. `updateOrderStatus` rejects unknown values and illegal transitions with a clear typed error; `requirePermission('orders.write')`; audit with before/after.
3. **Close gates for COMPLETED** computed server-side by a pure helper: (a) every applicable job phase is SIGNED_OFF (orders with no phase plan pass this gate, per D10), (b) produced quantity >= ordered quantity (if the order carries a quantity; read the schema), (c) no recorded QC check in a failing state without a later passing one (use the existing QC summary function). The result is a list of unmet gates.
4. If gates are unmet, completing requires an **override reason** (>= 3 chars), allowed for OWNER/ADMIN only, written to the audit row and shown on the order. With all gates met no reason is needed.
5. UI (phone and desktop): on CONFIRMED / IN_PRODUCTION orders show "Mark complete" (SlideOver listing each gate with pass/fail and an optional override reason), "Cancel order" (reason), and on COMPLETED "Mark delivered". Buttons absent for roles without `orders.write`. Existing closed-order refusals (production, picker) keep working: assert in a test that production logging is refused on a COMPLETED order.
6. `reopenOrder` unchanged.

## Do not touch
Production/QC server logic (read only), machine allocation, permissions matrix, kit, schema.

## Risk notes for the reviewer
Any caller that sets status directly (reopen sets IN_PRODUCTION itself; dashboards that count "needing action"). Grep all `updateOrderStatus`/`status:` writers on orders.
