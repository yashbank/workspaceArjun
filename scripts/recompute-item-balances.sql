-- Recompute the running balances of ONE item after test rows were deleted.
-- Both books carry "balance after this row"; deleting a row leaves every later balance wrong.
-- This rebuilds them as a running sum over the rows that remain, oldest first (created_at, id). Idempotent.
--
-- Usage (psql):   psql "$DIRECT_URL" -v item_code=ITEM-001 -f scripts/recompute-item-balances.sql
-- Supabase SQL editor has no psql variables: replace :'item_code' below with the quoted code, e.g. 'ITEM-001'.
--
-- Step 1 is a READ-ONLY preview: rows whose stored balance differs from the recomputed one. Read it first.
-- Step 2 (inside BEGIN/COMMIT) writes. Nothing is written by the preview.

-- 1. Preview (read-only): ledger rows and storekeeper-book rows that would change.
WITH it AS (SELECT id FROM mis_items WHERE code = :'item_code'),
ordered AS (
  SELECT l.id, l.created_at, l.balance_qty AS stored, SUM(l.change_qty) OVER (ORDER BY l.created_at, l.id) AS recomputed
  FROM mis_inventory_ledger l WHERE l.item_id = (SELECT id FROM it)
)
SELECT 'ledger' AS book, id, created_at, stored, recomputed FROM ordered WHERE stored IS DISTINCT FROM recomputed
UNION ALL
SELECT 'store_book', t.id, t.created_at, t.balance_qty, t.recomputed FROM (
  SELECT x.id, x.created_at, x.balance_qty, SUM(CASE WHEN x.type = 'IN' THEN x.quantity ELSE -x.quantity END) OVER (ORDER BY x.created_at, x.id) AS recomputed
  FROM mis_store_transactions x WHERE x.item_id = (SELECT id FROM it)
) t WHERE t.balance_qty IS DISTINCT FROM t.recomputed
ORDER BY 1, 3;

-- 2. Write.
BEGIN;

WITH it AS (SELECT id FROM mis_items WHERE code = :'item_code'),
ordered AS (
  SELECT l.id, SUM(l.change_qty) OVER (ORDER BY l.created_at, l.id) AS bal
  FROM mis_inventory_ledger l WHERE l.item_id = (SELECT id FROM it)
)
UPDATE mis_inventory_ledger l SET balance_qty = o.bal FROM ordered o WHERE l.id = o.id;

WITH it AS (SELECT id FROM mis_items WHERE code = :'item_code'),
ordered AS (
  SELECT t.id, SUM(CASE WHEN t.type = 'IN' THEN t.quantity ELSE -t.quantity END) OVER (ORDER BY t.created_at, t.id) AS bal
  FROM mis_store_transactions t WHERE t.item_id = (SELECT id FROM it)
)
UPDATE mis_store_transactions t SET balance_qty = o.bal FROM ordered o WHERE t.id = o.id;

COMMIT;

-- verify (the two figures should agree and be >= 0):
-- SELECT (SELECT balance_qty FROM mis_inventory_ledger WHERE item_id = (SELECT id FROM mis_items WHERE code=:'item_code') ORDER BY created_at DESC, id DESC LIMIT 1) AS ledger,
--        (SELECT balance_qty FROM mis_store_transactions WHERE item_id = (SELECT id FROM mis_items WHERE code=:'item_code') ORDER BY created_at DESC, id DESC LIMIT 1) AS store_book;
