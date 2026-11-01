-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (`pnpm db:deploy` after moving this
-- folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-286. Additive: one new enum value. A material request approved for less than it asked for stays open as
-- PARTIALLY_ISSUED until the Store issues the balance (then APPROVED). Existing rows are untouched.
--
-- ROLLBACK: PostgreSQL cannot drop an enum value; leave it (nothing references it once the code is reverted).
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261101000002_r2_286_request_partially_issued';

ALTER TYPE mis_material_request_status ADD VALUE IF NOT EXISTS 'PARTIALLY_ISSUED';
