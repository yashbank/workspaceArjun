# C3 — Money isolation on receive/Add Item, traceability completeness, QC access check

Items: #35 #36, ADMIN Add-Item price, D6 verification. Decisions: D5, D6. Branch `fix/c3-money-trace`. Wave 2: start after C1 is merged (C1 edits `store.ts`).

## Files (grep symbols)
- `src/components/mis/store/item-cart.tsx` (~333-345: the "₹ rate" input shown in RECEIVE mode to everyone), `src/server/mis/store.ts` (~964-968 `commitReceipt` writes `item.pricePerUnit = line.rate`), `src/server/mis/store-money.test.ts`.
- Add Item: `src/components/mis/inventory/inventory-screen.tsx` (price per unit field), `src/server/mis/inventory.ts`/`item.ts` create/update.
- Traceability: `src/server/mis/traceability.ts` (`getOrderTrace` ~9-60: no PO/supplier, no GRN, no issued materials), `src/server/mis/traceability-view.ts`, `traceability-money.test.ts`, `src/components/mis/traceability/traceability-screen.tsx`.
- Reuse: `withoutRates` (`lib/mis/bom-costing`), `can(role,'wages.read')`.

## Acceptance
1. **#36/D5** `commitReceipt` ignores `line.rate` (and never updates `pricePerUnit`) unless the actor has `wages.read`. The cart hides the rate input for everyone else. Existing prices are never sent to non-owners (keep `listPickerItems` as is).
2. **Add Item** `pricePerUnit` is accepted/updated only with `wages.read`; the field is hidden otherwise. Admin must not be able to set or see it.
3. **#35** `getOrderTrace` additionally returns: the linked PO header (number, status, supplier name) found through `MisPurchaseOrder.bomRef == order number`; the GRNs of that PO (number, date, status, received qty per line); and materials issued against the order (from `mis_store_transactions` and the inventory ledger, deduplicated, qty only). **All rates/amounts stripped unless `wages.read`** (reuse `withoutRates`; the trace page must show no ₹ for non-owners). UI shows PO and GRN blocks and a real "Material issued" list.
4. **D6** Verify and pin with tests: QC has no PO/GRN menu entries (`navigation.ts`), and `getGRN`/`listGRNs`/`listPOs`/`getPO` throw `MisForbiddenError` for QC. No permission changes.
5. Extend `traceability-money.test.ts` and `store-money.test.ts` (never weaken): non-owner payloads contain no money keys at any depth.

## Do not touch
`audit.ts`, orders/production/QC logic, kit, permissions matrix, schema.

## Risk notes
Money-leak surface. Walk the final props of the trace page and the cart for ADMIN/STORE_GUY/SUPERVISOR/QC with a recursive key scan.
