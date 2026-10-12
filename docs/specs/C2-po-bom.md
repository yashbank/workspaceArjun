# C2 — PO and BOM draft lifecycle, approval guards

Items: #1 #3 #4 #5 #6 #8 #9 #10 #30 (+ missing status guards). Decision: D1. Branch `fix/c2-po-bom`.

## Files (grep symbols)
- `src/server/mis/po.ts` — `createPO` (~101-123 purpose/bomRef rules; DB check `mis_purchase_orders_purpose_bom_ref_ck`), `submitForApproval` (~188: no item-count or status check), `approvePO` (~213), `cancelPO` (~246: no status guard), `addPOItem`/`updatePOItem`/`removePOItem` (no status guard), `reconcilePO`.
- `src/server/mis/bom.ts` — `createBom` (~95 idempotent), `submitBomForApproval` (~140), `approveBom` (~153, guarded), `deleteBomStage`/`deleteBomMaterial` (~168/174: no DRAFT guard), add stage/material (no guard), reorder.
- `src/server/mis/approvals.ts` (~12 `getPendingApprovals`), `src/lib/mis/po-purpose.ts` (`poPurpose`), `src/lib/mis/order-allocation.ts` (`orderNumberFromRef`).
- UI: `src/components/mis/po/po-list-screen.tsx` (~111 free-text BOM Ref), `po-detail-screen.tsx` (~92 submit button), `src/components/mis/bom/bom-screen.tsx` (~76 Approve only, ~136 unit), `src/components/mis/approvals/approvals-screen.tsx`, matching `actions.ts` files.

## Acceptance (each = test)
1. **#6** `submitForApproval` requires status DRAFT and >= 1 item with qty > 0; `approvePO` requires the right pending status and >= 1 item. UI: the Submit button is disabled with a tooltip "Add at least one line item" when there are none.
2. **Guards** `addPOItem`/`updatePOItem`/`removePOItem` require DRAFT. `cancelPO` allowed from DRAFT and pending-approval; from APPROVED only if no GRN exists for the PO; never from received/closed states (read the PO status enum first; refuse with a clear message).
3. **#5** `deleteDraftPO` (DRAFT only; deletes items; audit; confirm dialog) + a "Delete" button next to Cancel on DRAFT POs.
4. **#4** `updatePO` header edit (DRAFT only): supplier, purpose, bomRef, notes; reuse exactly the `createPO` purpose/bomRef validation (buffer stock => bomRef null). "Edit details" SlideOver on DRAFT.
5. **D1/#9** `createPO` and `updatePO` with purpose FOR_ORDER require that the referenced order exists and its BOM status is APPROVED; otherwise throw a typed friendly error ("BOM is not approved for order X"). The UI shows it as a popup/modal (reuse the confirm/alert pattern in `src/components/ui`), not the generic error page. BUFFER_STOCK untouched.
6. **#8/#30** BOM Ref becomes a select of orders that have an APPROVED BOM (label: order number · customer; value: the order-number string; NO FK, NO schema change). New server list function (permission `po.read`) returning plain data. Show an empty state "No approved BOMs yet" with the buffer-stock hint.
7. **#1** `rejectBom(orderId, reason)`: PENDING_APPROVAL -> DRAFT; same permission as approve; reason >= 3 chars; audit; notify the submitter/Admin through the existing notification mechanism. "Reject" button on the BOM screen and on the BOM row in the approvals queue (with reason SlideOver).
8. **#3** `deleteBom` DRAFT only, cascades stages+materials, audit, confirm dialog; refuse if any PO has `bomRef` equal to that order number or a material request references it. Order shows "No BOM yet" again.
9. **#10** `updateBomStage` / `updateBomMaterial` (DRAFT only): name, description, qty, unit, sequence; **rate editable only with `wages.read`** (ignore it otherwise, never echo it back to others — keep the existing `withoutRates` behaviour). Edit buttons + SlideOver. Add DRAFT guards to stage/material add/delete too.

## Do not touch
Orders, GRN/store, QC, audit redaction, kit components, permissions matrix. Run existing `po-buffer-stock.test.ts`, `po-numbering.test.ts`, `bom.test.ts`, `bom-costing` and money tests unchanged.

## Risk notes
BOM is 1:1 with order (`orderId` unique): deleting must cascade. PO FOR_ORDER stays a nullable string ref. Approved BOM data is read by costing and material-request: DRAFT guards must not break reading.
