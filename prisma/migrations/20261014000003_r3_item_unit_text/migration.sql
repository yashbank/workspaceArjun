-- Applied via `pnpm db:deploy`. Folder promoted from prisma/migrations-pending/ into
-- prisma/migrations/ on 2026-10-26 to fix repo/DB drift (this migration was already
-- live on production; the folder had just never been moved here).
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
