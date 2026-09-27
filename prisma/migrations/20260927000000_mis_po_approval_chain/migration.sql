-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 21 for when to
-- promote it (after the human runs `pnpm db:deploy && pnpm db:generate`).
--
-- Phase 21 (MIS-275) — the configurable PO approval chain (D2, D34).
-- SCHEMA GATE Half A only — this file and the schema.prisma edit in the same
-- commit. No TypeScript references any of this yet; that is Half B, a new
-- session, after `pnpm db:generate`. Apply together with the sibling
-- migration `20260915000000_mis_po_purpose` (D1) — both are Phase 21's gate.
--
-- D2: identical monetary thresholds for every PO, purpose is not an axis.
-- D34 (new, this phase — see DECISIONS.md): the mode is decided ONCE, at
-- submission, from a single effective-dated threshold rule (or an explicit
-- override), and snapshotted onto the PO row — never re-derived, so a later
-- threshold change cannot reopen a PO already on its way through approval
-- (the phase's own acceptance check). BOTH mode needs two sign-offs, so two
-- new columns hold the first (Admin) step; the existing `approved_by_id`/
-- `approved_at` become the FINAL sign-off for every mode.

DO $$ BEGIN
  CREATE TYPE mis_po_approval_mode AS ENUM ('OWNER_ONLY', 'ADMIN_ONLY', 'BOTH');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE mis_purchase_orders
  ADD COLUMN IF NOT EXISTS approval_mode       mis_po_approval_mode,
  ADD COLUMN IF NOT EXISTS admin_approved_by_id UUID,
  ADD COLUMN IF NOT EXISTS admin_approved_at    TIMESTAMPTZ;

-- Prisma side (schema.prisma), added in the same commit:
--
--   enum MisPoApprovalMode { OWNER_ONLY ADMIN_ONLY BOTH @@map("mis_po_approval_mode") }
--   model MisPurchaseOrder {
--     ...
--     approvalMode      MisPoApprovalMode? @map("approval_mode")
--     adminApprovedById String?            @map("admin_approved_by_id") @db.Uuid
--     adminApprovedAt   DateTime?          @map("admin_approved_at")
--     ...
--   }
--
-- Then `pnpm db:generate`. `prisma generate`/`migrate` cannot run from the
-- agent shell (engine download is 403-blocked), so this must be run on the
-- Mac before any code references `MisPoApprovalMode` — tsc will not compile
-- against a client that lacks it.
--
-- Rollback:
--   ALTER TABLE mis_purchase_orders
--     DROP COLUMN IF EXISTS approval_mode,
--     DROP COLUMN IF EXISTS admin_approved_by_id,
--     DROP COLUMN IF EXISTS admin_approved_at;
--   DROP TYPE IF EXISTS mis_po_approval_mode;
