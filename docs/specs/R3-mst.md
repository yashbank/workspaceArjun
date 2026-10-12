# R3-MST: Masters, item codes, unit/GSM/size dropdowns, PO lines, parties

Backlog: B23-B32. Branch `fix/r3-mst`. **Wave 1.** Model: Sonnet. Opus reviews the `po.ts` rate hunk only (money). Schema: **N** (the unit enum → text part is R3-S2). Estimate: ~100 agent-min.
Decisions: D5 (purchase rates are OWNER-only to write and see).

## Owned files
- `src/server/mis/item.ts`, `po.ts`, `supplier.ts`, `customer.ts`
- NEW `src/lib/mis/item-code.ts` (pure: `formatItemCode(n)`, `nextItemCodeNumber(codes: string[])`), NEW `src/server/mis/item-code.ts` (`allocateItemCode(tx, offset)`)
- NEW `src/lib/mis/item-options.ts` (pure: `unitChoices(options, legacyUnits)`)
- `src/app/(mis)/mis/inventory/actions.ts`, `src/app/(mis)/mis/inventory/page.tsx`, `src/app/api/mis/inventory/import/route.ts`, `src/app/api/mis/inventory/template/route.ts`
- `src/app/(mis)/mis/po/**` (pages + `actions.ts`), `src/app/(mis)/mis/print/po/**`, `src/app/(mis)/mis/suppliers/**`, `src/app/(mis)/mis/customers/**`
- `src/components/mis/inventory/inventory-screen.tsx`, `adjust-dialog.tsx`, `src/components/mis/items/**`, `src/components/mis/po/**`, `src/components/mis/suppliers/**`, `src/components/mis/customers/**`
- New tests `src/server/mis/r3-mst-*.test.ts`, `src/lib/mis/item-code.test.ts`, `src/lib/mis/item-options.test.ts`, `src/app/api/mis/inventory/import/route.test.ts`

## Read-only for you
`inventory.ts` (R3-STK owns it; call `adjustInventory(itemId, qty, notes?)` with the same shape), `store.ts`, `master-option.ts` (`listOptions`), `lib/mis/master-groups.ts`, `permissions.ts`.

## Items and acceptance
1. **B24 item codes.** `nextItemCodeNumber(codes)` = 1 + the max N over codes matching `^ITM-(\d+)$`, **including soft-deleted items**. Non-matching codes are ignored. `formatItemCode(n)` = `ITM-` + n zero-padded to 4 (5+ digits print as is). `createItemAction` (when the code is blank) and the import route use `allocateItemCode`, retrying on P2002 up to 5 times with offset+1.
   - Tests: `['ITM-0001','ITM-0007','X-9']` → 8. `[]` → 1. `ITM-9999` → `ITM-10000`. A P2002 on the first try → the second code is used. Two items imported in one file get consecutive codes.
   - **Admin-editable code:** `updateItem` accepts `code` for `masters.write` holders (ADMIN/OWNER), trimmed, non-empty, max 40, unique. A duplicate returns the friendly `mapPrismaError` text "Item with code 'X' already exists". The item edit form shows the code field for `masters.write` only. Test: ADMIN edits the code → OK and audited (before/after code). STORE_GUY → `MisForbiddenError`.
   - Name required (trimmed, 1..120) on create and import. Test.
2. **B32 dropdowns (non-schema part).** On the item add and edit forms (`inventory-screen.tsx`, the items screen):
   - **GSM** and **Size** are a `Select` of active `GSM` / `SIZE` master options (`listOptions`). The stored value is the option **label** (the columns are free strings today, so existing values keep working). An existing value not in the list is shown as an extra option "<value> (not in masters)".
   - **Unit** is a `Select` built by `unitChoices(activeUnitOptions, ['KG','LITRE','PIECE','REAM'])`: only options whose `value` is one of the 4 legacy enum values are offered. If none match, the 4 legacy values are offered with readable labels. The server `toItemUnit` stays enum-only until R3-S2.
   - No free-text input remains for these three fields. An empty master group shows the hint "Add values in Masters → GSM/Size/Unit" with a link (`masters.write` holders only).
   - Tests (pure `unitChoices`): master has `KG`,`SHEETS` → offers only KG. Master empty → 4 legacy values. Component test: GSM select lists the master labels plus a "(not in masters)" entry for a legacy value.
3. **B23 import route.** In `POST`:
   - (a) `try/catch` around `formData()` and `XLSX.read`, giving a 400 "Could not read the file".
   - (b) Reject files > 5 MB (413) and > 2,000 data rows (400) before parsing rows.
   - (c) For an existing item matched by code/sku, update **only** columns present and valid in that row. A blank or unknown category/unit leaves the stored value unchanged.
   - (d) Rows matching a soft-deleted or inactive item are skipped with reason "Item is deleted/inactive".
   - (e) Per-row `reason` uses `mapPrismaError` / plain words, never raw Prisma text.
   - (f) An OWNER price change is audited as `{ pricePerUnit: { from, to } }` **only in an OWNER-visible audit row**: follow the existing `redactAuditForRole` path; never put a price in an audit row without it. A non-OWNER's price column is ignored (existing D5 behaviour, keep it).
   - (g) Codes from `allocateItemCode`.
   - Tests:
     - A row with only Name + Code for a RAW_MATERIAL/KG item keeps RAW_MATERIAL/KG.
     - A deleted item's code is skipped.
     - A corrupt buffer → 400 JSON, not a throw.
     - 2,001 rows → 400.
     - A duplicate sku row gives a reason without "Unique constraint".
4. **B30** template route: `await requirePermission('masters.write')` first. Test: QC → 403, ADMIN → 200.
5. **B25 adjust dialog.** `adjustInventoryAction` is wrapped in `asResult`. `adjust-dialog.tsx` requires a reason (>= 3 chars, the Confirm button is disabled otherwise), `unwrap`s the result, and shows the server error inline ("Adjustment would result in negative balance") with the slide-over still open. Component test with a mocked `{ ok:false }`.
6. **B26 PO lines** (`addPOItem`, `updatePOItem`):
   - Quantity: finite, > 0, rounded to 2 dp.
   - Description: trimmed, non-empty.
   - `itemId`: when given, it must be an active, non-deleted item. A friendly error otherwise.
   - **`ratePerUnit` is written only when the actor holds `wages.read`.** For anyone else it is ignored on add, and on update the stored rate is left unchanged (mirror `addBomMaterial`).
   - `submitForApproval` computes ADMIN_ONLY vs BOTH from stored rates. If any line has a null rate, the mode is **BOTH** (Owner must sign and price).
   - Tests:
     - ADMIN adds a line with rate 0.01 → the stored rate is null.
     - OWNER → 0.01 stored.
     - ADMIN update with a rate leaves the OWNER rate unchanged.
     - Qty −50 / 0 / NaN → refused.
     - A PO with an unpriced line submits as BOTH.
     - The money scan of the `getPO` result for ADMIN finds no rate (existing behaviour; keep the test green).
7. **B27** `submitForApproval` requires a supplier and an `itemId` on every line. The message names the first offending line. Test.
8. **B28 CAS transitions.** `submitForApproval`, `approvePO` (both steps), `cancelPO` and `updatePO` use `updateMany({ where: { id, status: <expected> } })`. Count 0 → `Error('This PO was changed by someone else. Refresh and try again.')`. `cancelPO` performs the GRN count and the update in one tx. Tests: a double approve leaves the first stamp intact. Cancel after a GRN appears → refused.
9. **B29 parties.** `deleteSupplier` refuses while POs in DRAFT/PENDING_APPROVAL/APPROVED/PARTIAL exist ("Supplier has N open POs"). `deleteCustomer` refuses while non-closed orders exist (`isOrderClosed`). Both refuse an already-deleted row. `restore*` refuses unknown or not-deleted ids with a friendly error. The UI delete uses `useConfirm`. Tests per guard.
10. **B31 `asResult`** on every export of `inventory/actions.ts`, `po/actions.ts` (any not yet wrapped), `suppliers/actions.ts` and `customers/actions.ts`. Callers handle `ok:false` inline. One test per file.

## Do not touch
`store.ts`, `grn.ts`, `inventory.ts`, `master-option.ts` behaviour, `permissions.ts`, kit, schema, BOM. Keep green: `po-buffer-stock.test.ts`, `po-numbering.test.ts`, `po-bom-guards.test.ts`, `po-approve-access.test.ts`, `c3-price-writes.test.ts`, `master-duplicates.test.ts`.

## Risk notes
B26 changes the approval mode for Admin-entered POs (see backlog risk 4). The import route is the only bulk writer of items: test the "update only present columns" path carefully. Codes must never collide with existing manual codes (they are ignored when computing max, and P2002 retry covers a manual code equal to the next number).
