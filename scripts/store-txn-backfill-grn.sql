-- C1 / #22 backfill: store-transaction IN rows for CONFIRMED GRNs that only reached the Inventory ledger.
--
-- Before the fix, confirmGRN wrote mis_inventory_ledger only, so /mis/store/stock and
-- /mis/store/transactions never saw those receipts. confirmGRN now writes both books; this adds the
-- rows for GRNs confirmed earlier.
--
-- NOT RUN by the agent. The owner runs it once (psql / Supabase SQL editor). Safe to re-run.
--
-- How it avoids double counting:
--   * Source of truth is the ledger: one ledger row (source='GRN', source_id=<grn id>) = one receipt.
--   * A receipt is skipped when mis_store_transactions already holds a row for the same item whose
--     reference_no equals the GRN number. That is exactly how commitReceipt (the receive flow) and the
--     fixed confirmGRN reference their IN rows, so those GRNs are never counted twice, and a second
--     run of this script inserts nothing.
--   * New rows are appended at the END of each item's storekeeper chain (created_at = now()), with
--     balance_qty = current last balance + the cumulative backfilled quantity, so the running balance
--     stays consistent and no existing row is edited.
--   * Everything runs in one transaction; the before/after SELECTs let you check the count.
--
-- Live sizing (read-only, 2026-10-13): 2 ledger GRN receipts, 0 with a matching store row
-- (GRN-202610-10564 52000.00, GRN-202610-19853 500.00, both item 38ad5fd3-...).

BEGIN;

-- BEFORE: ledger GRN receipts with no storekeeper row.
SELECT g.grn_number, l.item_id, l.change_qty
FROM mis_inventory_ledger l
JOIN mis_grns g ON g.id::text = l.source_id
WHERE l.source = 'GRN' AND g.status = 'CONFIRMED' AND l.change_qty > 0
  AND NOT EXISTS (SELECT 1 FROM mis_store_transactions t WHERE t.item_id = l.item_id AND t.reference_no = g.grn_number)
ORDER BY l.created_at;

WITH missing AS (
  SELECT l.id AS ledger_id, l.item_id, l.change_qty, l.created_at AS ledger_at, g.grn_number,
         SUM(l.change_qty) OVER (PARTITION BY l.item_id ORDER BY l.created_at, l.id) AS running_qty
  FROM mis_inventory_ledger l
  JOIN mis_grns g ON g.id::text = l.source_id
  WHERE l.source = 'GRN' AND g.status = 'CONFIRMED' AND l.change_qty > 0
    AND NOT EXISTS (SELECT 1 FROM mis_store_transactions t WHERE t.item_id = l.item_id AND t.reference_no = g.grn_number)
),
base AS (
  SELECT m.*, COALESCE((
    SELECT t.balance_qty FROM mis_store_transactions t
    WHERE t.item_id = m.item_id ORDER BY t.created_at DESC LIMIT 1), 0) AS start_balance
  FROM missing m
)
INSERT INTO mis_store_transactions (id, txn_number, item_id, type, quantity, balance_qty, reference_no, reason, is_over_issue, created_by_id, created_at)
SELECT gen_random_uuid(),
       'STXN-BF-' || substr(replace(ledger_id::text, '-', ''), 1, 12),
       item_id, 'IN', change_qty, start_balance + running_qty, grn_number,
       'Backfill: GRN receipt missing from the storekeeper book', false, NULL,
       now() + (row_number() OVER (ORDER BY ledger_at, ledger_id)) * interval '1 millisecond'
FROM base
ON CONFLICT (txn_number) DO NOTHING;

-- AFTER: should return zero rows.
SELECT g.grn_number, l.item_id, l.change_qty
FROM mis_inventory_ledger l
JOIN mis_grns g ON g.id::text = l.source_id
WHERE l.source = 'GRN' AND g.status = 'CONFIRMED' AND l.change_qty > 0
  AND NOT EXISTS (SELECT 1 FROM mis_store_transactions t WHERE t.item_id = l.item_id AND t.reference_no = g.grn_number);

-- Inspect the two SELECTs, then COMMIT (or ROLLBACK to abandon).
COMMIT;
