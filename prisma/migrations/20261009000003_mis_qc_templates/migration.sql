-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 5 — QC checklist templates (paper → digital). Additive only, plus the four seeded forms
-- (same list as lib/mis/qc-template.ts DEFAULT_QC_TEMPLATES; re-running is a no-op).

CREATE TABLE IF NOT EXISTS mis_qc_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  process_name  TEXT,
  slot_start    TEXT NOT NULL DEFAULT '09:15',
  slot_end      TEXT NOT NULL DEFAULT '18:00',
  parameters    JSONB NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMP(3),
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE mis_qc_checks
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES mis_qc_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slot_time TEXT;

INSERT INTO mis_qc_templates (name, process_name, parameters, sort_order) VALUES
  ('Printing 6-Colours', 'Printing', '["Colour shade vs approved sample", "Registration", "Ink density", "Set-off / smudging", "Scumming / hickeys", "Sheet count"]'::jsonb, 0),
  ('Lamination', 'Lamination', '["Film type & GSM", "Bond strength (peel)", "Bubbles / wrinkles", "Trim alignment", "Curl"]'::jsonb, 1),
  ('Lamif Flute', 'Fluting', '["Flute profile", "Glue bond", "Warp", "Board thickness", "Surface damage"]'::jsonb, 2),
  ('Die Cutting', 'Die Cutting', '["Die position / registration", "Creasing depth", "Cut cleanliness (no burr)", "Stripping", "Sheet count"]'::jsonb, 3)
ON CONFLICT (name) DO NOTHING;
