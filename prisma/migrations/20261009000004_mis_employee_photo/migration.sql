-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 7 — employee photo for kiosk verification. Additive only.

ALTER TABLE mis_employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
