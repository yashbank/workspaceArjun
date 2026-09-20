-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 6 for when to
-- promote it (after the human runs `pnpm db:deploy && pnpm db:generate`).
--
-- Mini schema gate, Phase 6 Half B, STEP 1 · D7 CHANGED (docs/DECISIONS.md).
-- A clearance's validity is now a mode, not a fixed window:
--   JOB     — expires when the machine's current order changes (default)
--   SHIFT   — expires at the end of the shift it was granted in
--   MINUTES — fixed duration (the original Half A behaviour)
-- An optional max-minutes cap still applies on top of JOB/SHIFT, and is the
-- sole expiry for MINUTES — validity_minutes/expires_at are now nullable to
-- express "no cap" for JOB/SHIFT. mode/order_id/shift_id are snapshotted per
-- row (append-only, unchanged), so a later change to the mode business rule
-- never re-scores a clearance already granted.
--
-- mis_line_clearances has no code path writing to it yet (Half A only
-- created the table), so this alters an empty table — no backfill needed.

CREATE TYPE mis_line_clearance_mode AS ENUM ('JOB', 'SHIFT', 'MINUTES');

ALTER TABLE mis_line_clearances
  ADD COLUMN mode mis_line_clearance_mode NOT NULL DEFAULT 'JOB',
  ADD COLUMN order_id uuid REFERENCES mis_orders(id) ON DELETE SET NULL,
  ADD COLUMN shift_id uuid REFERENCES mis_shifts(id) ON DELETE SET NULL,
  ALTER COLUMN validity_minutes DROP NOT NULL,
  ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE mis_line_clearances ALTER COLUMN mode DROP DEFAULT;

CREATE INDEX mis_line_clearances_machine_cleared_idx ON mis_line_clearances (machine_id, cleared_at);

-- Prisma side (schema.prisma), added in the same commit:
--
--   enum MisLineClearanceMode {
--     JOB
--     SHIFT
--     MINUTES
--     @@map("mis_line_clearance_mode")
--   }
--
--   model MisLineClearance {
--     id              String                @id @default(uuid()) @db.Uuid
--     machineId       String                @map("machine_id") @db.Uuid
--     clearedById     String?               @map("cleared_by_id") @db.Uuid
--     clearedAt       DateTime              @default(now()) @map("cleared_at")
--     mode            MisLineClearanceMode  @map("mode")
--     orderId         String?               @map("order_id") @db.Uuid
--     shiftId         String?               @map("shift_id") @db.Uuid
--     validityMinutes Int?                  @map("validity_minutes")
--     expiresAt       DateTime?             @map("expires_at")
--     notes           String?
--     createdAt       DateTime              @default(now()) @map("created_at")
--     machine         MisMachine            @relation(fields: [machineId], references: [id])
--     order           MisOrder?             @relation(fields: [orderId], references: [id], onDelete: SetNull)
--     shift           MisShift?             @relation(fields: [shiftId], references: [id], onDelete: SetNull)
--     @@index([machineId, expiresAt])
--     @@index([machineId, clearedAt])
--     @@map("mis_line_clearances")
--   }
--
--   // on MisOrder: lineClearances MisLineClearance[]
--   // on MisShift: lineClearances MisLineClearance[]
--
-- Then `pnpm db:generate`. `prisma generate`/`migrate` cannot run from the
-- agent shell (engine download is 403-blocked), so this must be run on the
-- Mac before any code references the new columns — tsc will not compile
-- against a client that lacks them.
--
-- Rollback:
--   DROP INDEX IF EXISTS mis_line_clearances_machine_cleared_idx;
--   ALTER TABLE mis_line_clearances
--     ALTER COLUMN validity_minutes SET NOT NULL,
--     ALTER COLUMN expires_at SET NOT NULL,
--     DROP COLUMN shift_id,
--     DROP COLUMN order_id,
--     DROP COLUMN mode;
--   DROP TYPE mis_line_clearance_mode;
