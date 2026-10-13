# R3-STK: Stock books, GRN, receipt cap and tolerance

Backlog: B01-B22. Branch `fix/r3-stk`. **Wave 1.** Model: Sonnet. **Opus reviews the diff** (stock + money). Schema: **N**. Estimate: ~150 agent-min.
Decisions in force: D2 (refuse negative stock everywhere), D4, D5 (rates are OWNER-only), owner R3 scope "GRN over-receipt 2% tolerance with ADMIN override + reason; keep the supplier-invoice tolerance".

## Owned files (only this cluster edits them in wave 1)
- `src/server/mis/grn.ts`, `store.ts`, `store-books.ts`, `inventory.ts`, `material-request.ts`, `supplier-invoice.ts`
- NEW `src/lib/mis/receipt-rules.ts` (pure): `RECEIPT_TOLERANCE = 0.02`, `maxReceivable(ordered)`, `receiptVerdict(...)`, `poStatusAfterReceipt(lines)`
- NEW `src/lib/mis/stock-predicates.ts` (pure): `isLowStock(balance, reorderLevel)`
- `src/app/(mis)/mis/grn/**` (pages + `actions.ts`), `src/app/(mis)/mis/store/**` (pages + `actions.ts`), `src/app/(mis)/mis/supplier-invoices/**`, `src/app/(mis)/mis/inventory/[itemId]/page.tsx`
- `src/components/mis/grn/**`, `src/components/mis/store/**` (incl. `item-cart.tsx`, `store-count-screen.tsx`, `store-stock-screen.tsx`), `src/components/mis/supplier-invoices/**`
- `scripts/e2e-cleanup.sql`, `scripts/recompute-item-balances.sql`
- New tests: `src/server/mis/r3-stk-*.test.ts`, `src/lib/mis/receipt-rules.test.ts`, `src/lib/mis/stock-predicates.test.ts`

## Read-only for you (owned by others this wave)
`po.ts`, `item.ts`, `inventory/actions.ts`, `adjust-dialog.tsx` (R3-MST), `idempotency.ts` (call `runIdempotent` but do not edit it), `permissions.ts`, `business-rules.ts`.
**Contract with R3-MST:** keep `adjustInventory(itemId: string, changeQty: number, notes?: string)` unchanged in shape. Validate the reason inside it (see 7). MST's dialog makes the field required.

## Items and acceptance (each numbered line = at least one test)
1. **B01 PO status after GRN.** Extract the PARTIAL/COMPLETE rule that `commitReceipt` uses today into `poStatusAfterReceipt(lines: {quantity, receivedQuantity}[]) -> 'COMPLETE'|'PARTIAL'|null` (null = leave unchanged). Both `confirmGRN` and `commitReceipt` call it inside their tx, after the received increments.
   - Test: PO with lines 100/100 → after a GRN confirm receiving 100 and 100, `po.status === 'COMPLETE'`. Receiving 40 of 100 → `PARTIAL`. Second GRN for the remaining 60 → `COMPLETE`.
   - Test: `commitReceipt` with the same inputs produces the same statuses as before (run `store-integrity.test.ts` unchanged).
   - Deliverable (no code): put a read-only SQL in the PR body that lists POs whose lines are all fully received but whose status is not COMPLETE. Do NOT backfill.
2. **B02 open-PO guard.** `createGRN` and `confirmGRN` (re-checked inside the tx after the PO-line locks) and `commitReceipt` refuse unless the PO status is one of the open receivable statuses. Read the PO status enum first: APPROVED and PARTIAL, plus RECEIVING if it exists. The `GrnStateError` message is `PO <number> is <status>; goods can only be received against an approved PO.`
   - Tests: DRAFT, PENDING_APPROVAL, CANCELLED and COMPLETE each refuse create. A GRN created while APPROVED, whose PO is then cancelled, refuses confirm and writes nothing to either book.
3. **B03 receipt cap + 2% tolerance + ADMIN override.**
   - `maxReceivable(ordered) = round2(ordered * 1.02)`. A line is *within tolerance* when `receivedSoFar + alreadyOnThisGrn + qty <= maxReceivable(ordered)`.
   - `addGRNItem`, `updateGRNItem`, `confirmGRN` and each `commitReceipt` line: within tolerance means OK for any `grn.write` holder.
   - Beyond tolerance means OK **only** when the actor's role is ADMIN or OWNER **and** an `overReceiptReason` (trimmed, >= 3 chars) is passed. Otherwise throw `GrnStateError("<item/line> exceeds the order by more than 2% (max <maxReceivable> <unit>). Ask an Admin to override.")`.
   - `confirmGRN(grnId, opts?: { overReceiptReason?: string })` is the authoritative check, under the PO-line lock (`poItemLockKey`, sorted with the item keys).
   - `commitReceipt` takes the same lock. It now picks the first PO line for that item that still has room (not merely the first unclaimed line), and calls the same check.
   - An override writes one audit row `GRN_OVER_RECEIPT_OVERRIDE` with `after: { grnId, lines: [{ poItemId, ordered, receivedTotal, max }], reason }`. Quantities only, never rate or amount.
   - UI (`grn-detail-screen`, `item-cart` RECEIVE mode): the server error is shown inline. For ADMIN/OWNER only, an "Override with reason" SlideOver re-submits with the reason. STORE_GUY never sees the override control.
   - Tests:
     - (a) ordered 100: receive 102 → OK; receive 102.01 → refused for STORE_GUY.
     - (b) the same 102.01 as ADMIN with no reason → refused; with reason "ok" (2 chars) → refused; with "short delivery note" → OK and an audit row exists with no `rate`/`amount`/`₹` substring.
     - (c) `commitReceipt` with 500 against a line with 100 outstanding → refused for STORE_GUY.
     - (d) two lines of the same item, line 1 full: `commitReceipt` books line 2.
     - (e) a concurrent `confirmGRN` and `commitReceipt` on the same PO line serialize: lock keys are taken in sorted order (spy on `lockStockKeys`).
4. **B04 stale snapshot.** `confirmGRN` claims DRAFT→CONFIRMED with `updateMany({ where: { id, status: 'DRAFT' } })`, then **re-reads the lines inside the tx** and books from that read. `addGRNItem`, `updateGRNItem` and `updateGRNHeader` write with a status condition (`updateMany` / relation filter on `grn.status = 'DRAFT'`). A count of 0 throws `GrnStateError('GRN is no longer a draft')`.
   - Test: a line added after the claim is never written. A line added before the claim is booked. An update racing a confirm (status already CONFIRMED) throws.
5. **B06 GRN number (STK-05).** `nextGrnNumber(attempt)` follows `nextPoNumber(attempt)` and uses the factory month (`factoryDateKey`). Both callers retry on P2002 on `grn_number` up to 5 times.
   - Test: forced P2002 on attempt 0 → succeeds on attempt 1. Month prefix at 2026-10-31T20:00Z with Asia/Kolkata = `GRN-202611-`.
6. **B05 txn sequence (STK-04).** `nextTxnSeq` takes the global advisory key `stxn-seq`, added to the caller's sorted key set before the read (put the key constant in `stock-lock.ts`'s pattern, but in `store-books.ts`). Factory date prefix (STK-22).
   - Test: two concurrent movements on different items both succeed with distinct `txnNumber` (simulate with the fake tx / spy on lock keys including `stxn-seq`).
7. **B07 `adjustInventory`.** Requires `notes` trimmed >= 3 chars, else `Error('Give a reason (at least 3 characters).')`. Writes the ledger row AND the matching store-transaction row (IN for +, OUT for −) in one tx under the item lock, as `reconcilePhysicalCount` does. The negative check uses min(ledger, txn).
   - Tests: +50 → both balances +50. −5 with ledger 10 / txn 3 → refused. Missing reason → refused, nothing written.
8. **B08 `commitIssue`.** Pre-check uses `min(lastLedgerBalance, lastTxnBalance)`. `isOverIssue` is always false. The message matches `createStoreOut`'s: `Cannot issue more than the stock balance (X available)`.
   - Test: ledger 10, txn 4, issue 5 → refused. Issue 4 → OK and txn balance 0.
9. **B09 reconcile.** Inside the tx, under the item lock, adjustment = `physicalQty − min(currentLedger, currentTxn)` (rounded 2 dp). Refuse a second reconcile for the same item and the same factory count day (derive from the adjustment ledger rows' `source`/`sourceId`, no new column).
   - Tests: the audit scenario (count 90 vs 100, 8 issued later) → adjustment −2 and final 90. A second count of the same item on the same day, after the first is reconciled → refused.
10. **B10 invoice match.** `matchFor` / `reconcileSupplierInvoice` and the `confirmGRN` upsert match against **all CONFIRMED GRNs of the PO with that `supplierInvoiceNo`**. The tolerance stays `GREATEST(1.00, 0.5% of expected)` (B22: add a regression test asserting 1.00 and 0.5% boundaries).
    - Test: one invoice of 2 deliveries (two GRNs), amount = sum → MATCHED after the second confirm and after Reconcile.
11. **B11 cart idempotency.** `item-cart` generates a UUID per cart open (new key after success). `commitReceiptAction` / `commitIssueAction` take `idempotencyKey`. The server wraps the commit in `runIdempotent({ key, kind: 'STORE_RECEIPT'|'STORE_ISSUE', live: true, ... })`. Refactor the commit body into `(tx) => ...` with no behaviour change. If `runIdempotent` cannot host a live store commit without editing `idempotency.ts`, STOP that item and report (do not edit it).
    - Test: the same key twice → one set of rows; the second call returns the first result.
12. **B12** `updateGRNHeader`/confirm returns `warnings: ['Invoice <no> is already recorded on PO <other>']` when `(supplierId, invoiceNo)` exists on another PO. Shown as an amber note and not blocking. Test: warning present / absent.
13. **B13** `createStoreIn`, `createStoreOut`, `recordPhysicalCount` and `adjustInventory` use one `positiveQty` (finite, >0, round2) or `nonNegativeQty` (counts) validation, and the discrepancy is rounded to 2 dp. Tests: NaN, 0, 0.004, −1 (count) are refused. 1.005 is stored as 1.01 (or as the Decimal rounding you document).
14. **B14** `updateStoreItemProps`: `reorderLevel` finite and >= 0, `category` in the `MisItemCategory` enum, else a friendly error. The price path stays OWNER-only (unchanged). Tests.
15. **B15 factory time** in `store-books.ts`, `getStoreDashboard` ("today" = factory day), `listAllStoreTxns`, the `commitReceipt`/`commitIssue` reference date, `store/receive/page.tsx`, `store-count-screen.tsx` (default count date = factory today) and `inventory/[itemId]/page.tsx`. No `toLocale*`/`setHours`/`getFullYear`. Test: dashboard "today IN" includes a movement at 2026-10-13T19:00Z (00:30 IST on the 14th) only for the 14th.
16. **B16** `listStockSummary` / `getStoreDashboard` return money already rounded and formatted (`formatMoney`) for OWNER. Non-OWNER results contain no money key (existing redaction holds). The client does no `price * balance` arithmetic. Test: the money-key scan for the 7 non-OWNER roles plus the OWNER string format.
17. **B17** `isLowStock(balance, reorderLevel)`: `reorderLevel != null && balance <= reorderLevel` (0 is a valid level). Used by both the dashboard and the stock page. Tests incl. level 0 and null.
18. **B18** GRN Confirm uses `useConfirm` from `src/components/ui` (no `window.confirm`). Component test.
19. **B19 scripts.** `e2e-cleanup.sql`: remove the time-window `STORE_ISSUE` deletes, add a header "DEV/E2E DB ONLY — never on live", and add a per-item balance recompute for every touched item (ordered by `created_at, id`). `recompute-item-balances.sql`: take the item code as a psql variable, order by `created_at, id`, and run a read-only preview SELECT first. Not run by you.
20. **B20** `approveMaterialRequest`: the PENDING→APPROVED claim runs inside the same tx as the issue (`commitIssue`'s inner tx function). On failure nothing is claimed. Test: issue throws (short stock) → request still PENDING, no audit row.
21. **B21 `asResult`** on every export of `store/actions.ts`, `grn/actions.ts` (any not yet wrapped) and `supplier-invoices/actions.ts`. Callers `unwrap` and show `result.error` inline or in a toast. Test per action file: a thrown `GrnStateError` comes back as `{ ok: false, error: <same text> }`.

## Do not touch
`po.ts`, `item.ts`, the inventory import route, QC, orders, kiosk, `permissions.ts`, kit, `prisma/schema.prisma`, `idempotency.ts`, `audit.ts`. Run unchanged: `store-integrity.test.ts`, `grn-integrity.test.ts`, `grn-match.test.ts`, `material-request-integrity.test.ts`, `c1-stock-grn.test.ts`, `store-money.test.ts`, `c3-price-writes.test.ts`.

## Risk notes for the reviewer (Opus)
Lock ordering (all keys sorted, `stxn-seq` included). `confirmGRN` stays atomic and idempotent (a re-confirm is refused). No money in audit `after` (the override row). `commitReceipt`'s observable results stay identical for in-tolerance receipts. The override check uses the **role** from `requirePermission`'s actor, not a client flag.
