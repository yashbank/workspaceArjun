-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R3-S0 file 3 (for R3-S2): mis_items.unit from enum "MisItemUnit" to TEXT + seed UNIT master
-- options. The only type change in R3: apply it LAST, the same day as Deploy 2, just before it.
--
-- Between applying this and deploying R3-S2, the running app keeps writing the 4 enum values into a
-- TEXT column (Postgres assignment cast). Verified: no code filters `where: { unit }`.
--
--   * the ALTER TYPE step is wrapped in a DO block that skips when the column is already text
--   * the "MisItemUnit" type is kept (rollback needs it)
--   * UNIT options KG/LITRE/PIECE/REAM are seeded only where no non-deleted row exists for that value
--
-- ORDER OF OPERATIONS: after files 1 and 2 and after SG; same day as Deploy 2, just before it.
--
-- ROLLBACK (valid only while every mis_items.unit is one of KG, LITRE, PIECE, REAM; leave the
-- seeded options in place). Run the first SELECT; it must return 0 rows:
--   SELECT id, unit FROM mis_items WHERE unit NOT IN ('KG','LITRE','PIECE','REAM');
--   ALTER TABLE mis_items ALTER COLUMN unit DROP DEFAULT;
--   ALTER TABLE mis_items ALTER COLUMN unit TYPE "MisItemUnit" USING unit::"MisItemUnit";
--   ALTER TABLE mis_items ALTER COLUMN unit SET DEFAULT 'KG'::"MisItemUnit";
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261014000003_r3_item_unit_text';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'mis_items'
                AND column_name = 'unit' AND data_type <> 'text') THEN
    ALTER TABLE mis_items ALTER COLUMN unit DROP DEFAULT;
    ALTER TABLE mis_items ALTER COLUMN unit TYPE TEXT USING unit::text;
    ALTER TABLE mis_items ALTER COLUMN unit SET DEFAULT 'KG';
  END IF;
END $$;

INSERT INTO mis_master_options (id, "group", value, label, sort_order, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), 'UNIT', v.value, v.label, v.sort_order, true, now(), now()
    FROM (VALUES ('KG', 'Kg', 10), ('LITRE', 'Litre', 20), ('PIECE', 'Piece', 30), ('REAM', 'Ream', 40))
         AS v(value, label, sort_order)
   WHERE NOT EXISTS (SELECT 1 FROM mis_master_options o
                      WHERE o."group" = 'UNIT' AND o.value = v.value AND o.deleted_at IS NULL);

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '98b1a863-3fb4-43f9-9366-dce5d5f5deec', '639fc45b0105843c16542dc6c019eb48c5555bd16a7cdbdb13be01e7b4d5ee6b', now(), '20261014000003_r3_item_unit_text', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261014000003_r3_item_unit_text');

COMMIT;

-- verify:
-- SELECT data_type FROM information_schema.columns WHERE table_name='mis_items' AND column_name='unit';  -- expect text
-- SELECT value, label, sort_order FROM mis_master_options WHERE "group"='UNIT' AND deleted_at IS NULL ORDER BY sort_order;
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261014000003_r3_item_unit_text';
