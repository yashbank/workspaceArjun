-- NOT APPLIED. Parked in prisma/migrations-pending/ for a human to run via `pnpm db:deploy`.
-- V2 Epic 7 — employee photo for kiosk verification. Additive only.

ALTER TABLE mis_employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
