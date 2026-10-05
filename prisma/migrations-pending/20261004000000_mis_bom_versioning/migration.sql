-- NOT APPLIED. Parked in prisma/migrations-pending/ for a human to run via
-- `pnpm db:deploy` (never applied by an agent directly — no DDL via the Supabase
-- MCP connector, which is read-only here). schema.prisma already carries the
-- matching fields and `pnpm db:generate` has been run against them, but no
-- application code reads or writes `version`/`lastApprovedSnapshot` yet — that
-- is deliberately deferred to a follow-up change, AFTER this migration is
-- confirmed applied, so nothing ships that queries a column the live database
-- does not have yet.
--
-- Track 4 (Phase 28) — E5-05 (MIS-104/121/122): BOM approval gate and versioning.
--
-- F-37's own finding was that `approveBom`/`submitBomForApproval` had no status guard at all —
-- fixed at the server-function level (`src/server/mis/bom.ts`, shipped in this same PR, no
-- schema change needed for that half). This migration is the OTHER half, prepared but not yet
-- live: the design artboard `P5-Approval-queue.png` (MIS-122) labels every queued BOM "BOM v2"
-- and "Changed since v1 · 3 lines" — a version number and a diff against the last approved cut,
-- so a second approval means something instead of being a rubber stamp. Both are additive,
-- backward-compatible columns; nothing existing reads them.
--
-- version: starts at 1 (the first, never-yet-approved draft). Bumped by `reopenBom` when an
-- already-APPROVED BOM is reopened for further changes — the only path back to DRAFT.
--
-- last_approved_snapshot: a JSON snapshot of the BOM's materials (stageId, materialId,
-- description, quantity, ratePerUnit) taken at the moment of its last approval. Nothing but the
-- approvals queue reads it (to compute "changed since vN"); it is never used for costing itself —
-- `getBomCosting` always reads the live rows.

ALTER TABLE mis_bom
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_approved_snapshot JSONB;

-- Prisma side (schema.prisma), added in the same commit:
--
--   model MisBom {
--     ...
--     version              Int    @default(1)
--     lastApprovedSnapshot Json?  @map("last_approved_snapshot") @db.JsonB
--     ...
--   }
--
-- Then `pnpm db:generate`.
--
-- Rollback:
--   ALTER TABLE mis_bom DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS last_approved_snapshot;
