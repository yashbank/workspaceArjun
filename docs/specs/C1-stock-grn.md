# C1 — Stock books, GRN draft handling, material-request escalation

Items: #14 #22 #23 #24 #11 #12 #13 + D7. Decisions: D2, D3, D4, D7. Branch `fix/c1-stock-grn`.
Live facts (2026-10-13): 0 PO lines lack an item (so D4 cannot hit existing data); 8 confirmed GRNs, all in `mis_inventory_ledger`; only 6 store-transaction rows name a GRN.

## Files (grep symbols; lines approximate)
- `src/server/mis/grn.ts` — `confirmGRN` (~270-335: writes ONLY `mis_inventory_ledger`; has `if (!grnItem.poItem.itemId) continue;`), `addGRNItem`, `updateGRNItem` (~227, DRAFT-only, cap-checked), helpers `GrnStateError`, `loadDraftGrn`, `lineQuantities`, `assertWithinOutstanding`.
- `src/server/mis/store.ts` — `commitReceipt` (~848-940 writes BOTH books: the pattern to reuse), `createStoreOut` (~239-270: writes only the txn book, allows over-issue with a reason), `recordPhysicalCount` (~412-456: audit only), `listStockSummary` (~355 reads `mis_store_transactions`), helpers `round2`, `lastLedgerBalance`, `lastTxnBalance`, `nextTxnSeq`, `nextTxnNumber` (~809-838), `commitIssue` (~1074-1086 checks the ledger).
- `src/server/mis/inventory.ts` (~34-47 reads the ledger; `adjustInventory` ~55 refuses negatives), `src/server/mis/stock-lock.ts` (`lockStockKeys`, `itemLockKey`).
- `src/server/mis/material-request.ts` (`createMaterialRequest` ~35, notify fan-out), `src/server/notifications/`.
- UI: `src/components/mis/grn/grn-detail-screen.tsx` (~111-112 hides added PO lines; ~210-228 read-only cards), `src/app/(mis)/mis/grn/actions.ts`, `src/components/mis/store/store-count-screen.tsx`, store transactions screen (over-issue reason field).

## Acceptance (each = at least one test)
1. **#14/D4** `confirmGRN` throws `GrnStateError` naming the offending line (PO line description + sequence) when any line with `receivedQty > 0` has no `poItem.itemId`; nothing is written; the message reaches the user via `asResult`.
2. **#22** `confirmGRN`, in the SAME transaction and under the same item locks, also writes the store-transaction IN row (and chains balance) per stocked line, using the same helpers `commitReceipt` uses (extract a small shared internal helper only if you must; do NOT refactor `commitReceipt` behaviour). `/mis/store/stock` and `/mis/store/transactions` then reflect a GRN receipt; `/mis/inventory` is unchanged. Re-confirm of a confirmed GRN stays refused (no double write).
3. **#22 backfill** Write `scripts/store-txn-backfill-grn.sql`: idempotent, in a transaction, with before/after SELECTs, inserting the missing IN rows for already-confirmed GRNs that lack them (skip any GRN already represented, e.g. via `reference_no` or the receive flow). DO NOT run it; the owner will. State in its header how it avoids double counting. Use read-only SELECTs on the live DB (project `kmaxtksmeabmmlervpjl`) to size it.
4. **#24/D2** `createStoreOut` refuses when quantity > current balance (message "Cannot issue more than the stock balance (X available)"); remove the over-issue-with-reason path and its form field; keep message wording consistent with `commitIssue`. It must also write the ledger OUT (as `commitIssue` does) under the item lock so Inventory, Store stock and Traceability agree. No negative balance can be produced by any of: store out, issue, inventory adjustment.
5. **#23/D3** Add `reconcilePhysicalCount(countId, reason)` (permission `store.write`, reason >= 3 chars, audit): writes the variance as an adjustment to BOTH books under the item lock. "Reconciled" must be derivable WITHOUT a new column (e.g. an adjustment ledger row whose `source` marks a count adjustment and `source_id` = count id); a count can be reconciled once. Variance 0 -> no button. A negative variance larger than the balance is refused. UI: "Reconcile" button on rows with variance != 0 and not reconciled; a SlideOver asks for the reason.
6. **#11/#13** GRN detail (DRAFT only): each added line shows Edit (uses the existing `updateGRNItem`/action) and Remove (new `removeGRNItem`, DRAFT-only, audit); header gets "Discard draft" (new `discardGRN`, DRAFT-only hard delete of header+lines, audit, confirm dialog from `src/components/ui`). Confirmed GRNs show none of these. Never allow on CONFIRMED (server guard + test).
7. **#12** The PO-line picker lists every PO line with remaining capacity (ordered − received − quantity already on this GRN) and shows "remaining N"; the same PO line can be added again for another batch. The server cap (`assertWithinOutstanding`) remains the authority.
8. **D7** `createMaterialRequest` notifies STORE_GUY **and** ADMIN **and** OWNER (reuse the existing notification kind/table); Admin and Owner can open `/mis/store/requests` and approve/issue (they hold `store.write` — assert in a test; do not change `permissions.ts`).

## Do not touch
QC, orders, audit redaction, kiosk, permissions matrix, kit components, `commitReceipt`/`commitIssue` behaviour (callers' observable results must stay identical: run `store-integrity.test.ts`, `grn-integrity.test.ts`, `material-request-integrity.test.ts`, `grn-match.test.ts` unchanged).

## Risk notes for the reviewer
Stock/ledger arithmetic and locks. Check lock ordering (sorted keys) so a GRN confirm with several items cannot deadlock with an issue. Check `confirmGRN` stays idempotent and atomic.
