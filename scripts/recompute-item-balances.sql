-- Recompute the running balances of ONE item after test rows were deleted.
-- Both books carry "balance after this row"; deleting a row leaves every later balance wrong.
-- This rebuilds them as a running sum over the rows that remain, oldest first. Idempotent.
-- Change the code below if another item needs it. Run in the Supabase SQL editor (plain Run).
BEGIN;

WITH it AS (SELECT id FROM mis_items WHERE code = 'ITEM-001'),
ordered AS (
  SELECT l.id, SUM(l.change_qty) OVER (ORDER BY l.created_at, l.id) AS bal
  FROM mis_inventory_ledger l WHERE l.item_id = (SELECT id FROM it)
)
UPDATE mis_inventory_ledger l SET balance_qty = o.bal FROM ordered o WHERE l.id = o.id;

WITH it AS (SELECT id FROM mis_items WHERE code = 'ITEM-001'),
ordered AS (
  SELECT t.id, SUM(CASE WHEN t.type = 'IN' THEN t.quantity ELSE -t.quantity END) OVER (ORDER BY t.created_at, t.id) AS bal
  FROM mis_store_transactions t WHERE t.item_id = (SELECT id FROM it)
)
UPDATE mis_store_transactions t SET balance_qty = o.bal FROM ordered o WHERE t.id = o.id;

COMMIT;

-- verify (the two figures should agree and be >= 0):
-- SELECT (SELECT balance_qty FROM mis_inventory_ledger WHERE item_id = (SELECT id FROM mis_items WHERE code='ITEM-001') ORDER BY created_at DESC, id DESC LIMIT 1) AS ledger,
--        (SELECT balance_qty FROM mis_store_transactions WHERE item_id = (SELECT id FROM mis_items WHERE code='ITEM-001') ORDER BY created_at DESC, id DESC LIMIT 1) AS store_book;
