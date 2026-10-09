-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 3 — categorised Material Issue Notes. Additive only: two new tables, one enum.

CREATE TYPE mis_material_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE IF NOT EXISTS mis_material_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number   TEXT NOT NULL UNIQUE,
  status           mis_material_request_status NOT NULL DEFAULT 'PENDING',
  order_id         UUID REFERENCES mis_orders(id),
  department_id    UUID REFERENCES mis_departments(id),
  notes            TEXT,
  requested_by_id  UUID,
  decided_by_id    UUID,
  decided_at       TIMESTAMP(3),
  decision_note    TEXT,
  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS mis_material_requests_status_idx ON mis_material_requests(status);

CREATE TABLE IF NOT EXISTS mis_material_request_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID NOT NULL REFERENCES mis_material_requests(id),
  item_id            UUID NOT NULL REFERENCES mis_items(id),
  requested_qty      DECIMAL(12,2) NOT NULL,
  actual_issued_qty  DECIMAL(12,2)
);
CREATE INDEX IF NOT EXISTS mis_material_request_lines_request_id_idx ON mis_material_request_lines(request_id);
