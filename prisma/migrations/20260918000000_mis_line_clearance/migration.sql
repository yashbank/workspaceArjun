-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 6 for when to
-- promote it (after the human runs `pnpm db:deploy && pnpm db:generate`).
--
-- Line clearance for Phase 6 (MIS-137/148/149) · a supervisor must clear a
-- machine before production can be logged against it, and the clearance
-- expires. Append-only: each "clear the line" action is a new row, which
-- also gives MIS-149 its clearance history for free — nothing here is ever
-- updated in place, only inserted.
--
-- validity_minutes snapshots the business rule (D6,
-- LINE_CLEARANCE_VALIDITY_MINUTES) in force at the moment of clearing, so a
-- later change to that rule never reaches back and extends or shortens a
-- clearance already granted — the same immutable-snapshot discipline Phase 5
-- used for AQL threshold decisions.

CREATE TABLE mis_line_clearances (
  id               uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id       uuid NOT NULL REFERENCES mis_machines(id),
  cleared_by_id    uuid,
  cleared_at       timestamp with time zone NOT NULL DEFAULT now(),
  validity_minutes integer NOT NULL,
  expires_at       timestamp with time zone NOT NULL,
  notes            text,
  created_at       timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX mis_line_clearances_machine_expires_idx ON mis_line_clearances (machine_id, expires_at);

-- Prisma side (schema.prisma), added in the same commit:
--
--   model MisLineClearance {
--     id              String     @id @default(uuid()) @db.Uuid
--     machineId       String     @map("machine_id") @db.Uuid
--     clearedById     String?    @map("cleared_by_id") @db.Uuid
--     clearedAt       DateTime   @default(now()) @map("cleared_at")
--     validityMinutes Int        @map("validity_minutes")
--     expiresAt       DateTime   @map("expires_at")
--     notes           String?
--     createdAt       DateTime   @default(now()) @map("created_at")
--     machine         MisMachine @relation(fields: [machineId], references: [id])
--     @@index([machineId, expiresAt])
--     @@map("mis_line_clearances")
--   }
--
--   // on MisMachine:
--   lineClearances MisLineClearance[]
--
-- Then `pnpm db:generate`. `prisma generate`/`migrate` cannot run from the
-- agent shell (engine download is 403-blocked), so this must be run on the
-- Mac before any code references `MisLineClearance` — tsc will not compile
-- against a client that lacks it.
--
-- Rollback:
--   DROP TABLE mis_line_clearances;
