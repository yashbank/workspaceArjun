# R3-S0: Author the R3 SQL (Half A only, no schema.prisma, no TypeScript)

Branch `chore/r3-s0-sql`. **Wave 1** (runs in parallel; touches only `prisma/migrations-pending/`). Model: Sonnet. **Opus reviews** every SQL file. Estimate: ~30 agent-min.
Follow the `mis-schema-gate` skill, with this round's override: **do NOT edit `prisma/schema.prisma`** (that is step SG, after the owner has applied the SQL). Copy the shape of `prisma/migrations-pending/20261012000000_mis_supplier_invoice_status/` exactly: a `migration.sql` with a NOT-APPLIED header, an ORDER OF OPERATIONS note and a ROLLBACK comment block, plus an `apply-in-sql-editor.sql` = `BEGIN;` + the same DDL + the `_prisma_migrations` ledger `INSERT ... WHERE NOT EXISTS` + `COMMIT;` + verify SELECTs.
Checksum = `shasum -a 256 migration.sql` (compute it after the final edit). Ledger `id` = a fresh `uuidgen` (lower-case). Everything idempotent (`IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`). Never `NOT NULL` on existing rows. Never run any of it: the Supabase MCP is read-only SELECTs, row counts first.

## Owned files
`prisma/migrations-pending/20261014000001_r3_production_void_makeready/{migration.sql,apply-in-sql-editor.sql}`
`prisma/migrations-pending/20261014000002_r3_worker_allocation_default_shift/{migration.sql,apply-in-sql-editor.sql}`
`prisma/migrations-pending/20261014000003_r3_item_unit_text/{migration.sql,apply-in-sql-editor.sql}`

## Pre-checks (read-only SELECTs, quote results in the PR)
- Columns don't already exist: `information_schema.columns` for the tables below.
- `SELECT count(*) FROM mis_worker_allocations;` and the duplicate probe (see file 2).
- `SELECT unit, count(*) FROM mis_items GROUP BY 1;` and `SELECT value, label, deleted_at FROM mis_master_options WHERE "group"='UNIT';`
- `SELECT count(*) FROM mis_production_log; SELECT count(*) FROM mis_qc_checks;`

## File 1: `20261014000001_r3_production_void_makeready` (for R3-S1)
- `mis_production_log`: `voided_at TIMESTAMP(3) NULL`, `void_reason TEXT NULL`, `makeready_minutes INTEGER NULL`
- `mis_qc_checks`: `voided_at TIMESTAMP(3) NULL`, `void_reason TEXT NULL`
- CHECK constraints (added in `DO` blocks, idempotent):
  - `mis_production_log_void_pair_ck`: `(voided_at IS NULL) = (void_reason IS NULL)`
  - `mis_qc_checks_void_pair_ck`: the same
  - `mis_production_log_makeready_ck`: `makeready_minutes IS NULL OR makeready_minutes BETWEEN 0 AND 1440`
- Rollback: drop the 3 constraints and 5 columns, delete the ledger row.
- Verify: `SELECT column_name FROM information_schema.columns WHERE table_name IN ('mis_production_log','mis_qc_checks') AND column_name IN ('voided_at','void_reason','makeready_minutes');` → 5 rows.

## File 2: `20261014000002_r3_worker_allocation_default_shift` (for R3-S2)
- `mis_employees.default_shift_id UUID NULL`, FK `mis_employees_default_shift_id_fkey` → `mis_shifts(id) ON DELETE SET NULL ON UPDATE CASCADE`, index `mis_employees_default_shift_id_idx`.
- `mis_worker_allocations`:
  - `released_by_id UUID NULL`
  - `release_reason TEXT NULL` + CHECK `mis_worker_allocations_release_reason_ck`: `release_reason IS NULL OR release_reason IN ('MANUAL','MOVED','PHASE_SIGNED_OFF','MACHINE_RELEASED','ORDER_CLOSED','CLOCKED_OUT')`
  - `crew_role TEXT NULL` + CHECK `mis_worker_allocations_crew_role_ck`: `crew_role IS NULL OR crew_role IN ('OPERATOR','HELPER','INCHARGE')`
- Partial unique index (Prisma cannot model it; S2's schema comment will say so):
  `CREATE UNIQUE INDEX IF NOT EXISTS mis_worker_allocations_open_uq ON mis_worker_allocations (employee_id, allocation_date, COALESCE(shift_id, '00000000-0000-0000-0000-000000000000'::uuid), machine_allocation_id) WHERE released_at IS NULL AND deleted_at IS NULL;`
  It is preceded by a `DO` block that `RAISE EXCEPTION`s with the count if duplicate open rows exist (same GROUP BY, `HAVING count(*) > 1`), so the transaction aborts cleanly instead of half-applying.
- Rollback: drop the index, the checks, the FK, the index and the 4 columns; delete the ledger row.
- Verify: the 4 columns exist; `SELECT indexname FROM pg_indexes WHERE indexname='mis_worker_allocations_open_uq';` → 1 row.

## File 3: `20261014000003_r3_item_unit_text` (for R3-S2; the only type change, so apply it last and right before the S2 deploy)
```
ALTER TABLE mis_items ALTER COLUMN unit DROP DEFAULT;
ALTER TABLE mis_items ALTER COLUMN unit TYPE TEXT USING unit::text;
ALTER TABLE mis_items ALTER COLUMN unit SET DEFAULT 'KG';
```
- Keep the `"MisItemUnit"` type (do NOT drop it; rollback needs it).
- Make the ALTER TYPE step idempotent: wrap it in a `DO` block that checks `data_type <> 'text'` first.
- Seed UNIT master options for `KG`/`LITRE`/`PIECE`/`REAM` (labels `Kg`, `Litre`, `Piece`, `Ream`, `sort_order` 10/20/30/40), inserting only where no non-deleted row with that `"group"='UNIT' AND value=...` exists. Use `gen_random_uuid()` for `id` and `now()` for `created_at`/`updated_at` (`updated_at` has no DB default).
- Header note: "Between applying this and deploying R3-S2, the running app keeps writing the 4 enum values into a TEXT column (Postgres assignment cast). Verified: no code filters `where: { unit }`."
- Rollback: `ALTER TABLE mis_items ALTER COLUMN unit DROP DEFAULT; ALTER COLUMN unit TYPE "MisItemUnit" USING unit::"MisItemUnit"; SET DEFAULT 'KG'::"MisItemUnit";`. This is valid only while every value is one of the 4. The block starts with a SELECT that lists offenders. Leave the seeded options in place.
- Verify: `SELECT data_type FROM information_schema.columns WHERE table_name='mis_items' AND column_name='unit';` → `text`.

## Acceptance (QA)
1. Each `apply-in-sql-editor.sql` parses: run `psql --set ON_ERROR_STOP=1 -f` **only if** a local throwaway Postgres is available. Otherwise state "not executed" in the PR. Never against Supabase.
2. Each ledger checksum equals `shasum -a 256` of its `migration.sql` (paste both in the PR).
3. Running each apply file twice is a no-op (idempotency argued line by line in the PR if not executed).
4. Outside the ROLLBACK comment blocks there is no `DROP TABLE|COLUMN|TYPE|INDEX|CONSTRAINT`, no `NOT NULL` and no `DELETE` (grep in the PR). File 3's `DROP DEFAULT` is the only allowed `DROP`.
5. `node_modules/.bin/tsc --noEmit --skipLibCheck` is still silent: no TypeScript changed.
