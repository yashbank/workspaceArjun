-- NOT APPLIED. Parked in prisma/migrations-pending/ for a human to run via `pnpm db:deploy`.
-- V2 Epic 2 — order-wise stock allocation. Additive only: one new table.

CREATE TABLE IF NOT EXISTS mis_order_stock_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES mis_orders(id),
  item_id        UUID NOT NULL REFERENCES mis_items(id),
  allocated_qty  DECIMAL(12,2) NOT NULL,
  source         TEXT NOT NULL,
  source_id      TEXT,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mis_order_stock_allocations_order_id_item_id_idx ON mis_order_stock_allocations(order_id, item_id);
