-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, or
-- `pnpm db:deploy` after moving this folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-158. Additive and idempotent: one new enum value.
--
--   1. mis_doc_version_status gains VOID — a PREPARED COA / job-card version discarded by its preparer,
--      an Admin or the Owner. The row is kept (soft void); the reason is in the audit log.
--
-- ORDER OF OPERATIONS: apply this BEFORE deploying code that can write VOID. Until it is applied the
-- "Discard" button fails with a database error (the enum has no VOID); nothing else is affected.
-- NOTE: ALTER TYPE ... ADD VALUE cannot be used in the same transaction as a statement that uses the
-- new value. Run this file on its own.
--
-- ROLLBACK: Postgres cannot drop an enum value. Leave VOID in place (harmless); only code needs reverting.

ALTER TYPE mis_doc_version_status ADD VALUE IF NOT EXISTS 'VOID';
