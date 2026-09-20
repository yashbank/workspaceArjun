-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 10 for when to
-- promote it (after the human runs `pnpm db:deploy && pnpm db:generate`).
--
-- Phase 10 · the offline write queue's server side (MIS-25/85/86).
-- The full contract is DEVELOPMENT_GUIDE.md **Appendix B**; this table is its
-- storage. Read §B.2 (the key), §B.3 (the five outcomes) and §B.7 (why a park
-- is durable here and not only on the device) before changing anything below.
--
-- New table only. Nothing existing is altered, so there is nothing to backfill
-- and no live row changes meaning.

CREATE TYPE mis_queued_write_status AS ENUM ('IN_FLIGHT', 'APPLIED', 'PARKED', 'REJECTED');

CREATE TABLE mis_queued_writes (
  -- The client-generated idempotency key IS the primary key (§B.2). Two
  -- racing replays are then settled by the database rather than by a
  -- read-then-write check that can lose: one insert wins, the other takes a
  -- unique violation, re-reads and returns the winner's result. The server
  -- validates the UUID shape before trusting a client-supplied identifier.
  key                uuid NOT NULL PRIMARY KEY,
  kind               text NOT NULL,
  status             mis_queued_write_status NOT NULL DEFAULT 'IN_FLIGHT',
  -- Kept for PARKED and REJECTED rows so a park can be resolved from the
  -- portal when the device that made it never comes back (§B.7). A parked
  -- write that lived only on a lost tablet would be a silently lost
  -- production record, which is the failure this whole contract exists to
  -- prevent.
  payload            jsonb NOT NULL,
  -- What the original successful call returned, replayed verbatim to the
  -- nine attempts that follow the one that applied (§B.3, DUPLICATE).
  result             jsonb,
  entity_type        text,
  entity_id          uuid,
  park_reason        text,
  park_detail        text,
  -- What the device claimed, stored raw — never rounded, clamped or
  -- corrected (D15). For client-recorded kinds this is the business time; for
  -- server-stamped kinds it is evidence. Also the replay ordering key (§B.6).
  client_recorded_at timestamp with time zone,
  device_id          text,
  actor_id           uuid,
  attempts           integer NOT NULL DEFAULT 0,
  first_seen_at      timestamp with time zone NOT NULL DEFAULT now(),
  last_attempt_at    timestamp with time zone,
  applied_at         timestamp with time zone,
  resolved_by_id     uuid,
  resolved_at        timestamp with time zone,
  resolution_note    text
);

-- "Is anything stuck anywhere in the factory?" — the Phase 22 inbox's query.
CREATE INDEX mis_queued_writes_status_idx ON mis_queued_writes (status);
CREATE INDEX mis_queued_writes_kind_status_idx ON mis_queued_writes (kind, status);
-- Oldest park first, which is the order a human should work through them.
CREATE INDEX mis_queued_writes_status_recorded_idx
  ON mis_queued_writes (status, client_recorded_at);

-- Prisma side (schema.prisma), added in the same commit:
--
--   enum MisQueuedWriteStatus {
--     IN_FLIGHT
--     APPLIED
--     PARKED
--     REJECTED
--     @@map("mis_queued_write_status")
--   }
--
--   model MisQueuedWrite {
--     key              String               @id
--     kind             String
--     status           MisQueuedWriteStatus @default(IN_FLIGHT)
--     payload          Json                 @db.JsonB
--     result           Json?                @db.JsonB
--     entityType       String?              @map("entity_type")
--     entityId         String?              @map("entity_id") @db.Uuid
--     parkReason       String?              @map("park_reason")
--     parkDetail       String?              @map("park_detail")
--     clientRecordedAt DateTime?            @map("client_recorded_at")
--     deviceId         String?              @map("device_id")
--     actorId          String?              @map("actor_id") @db.Uuid
--     attempts         Int                  @default(0)
--     firstSeenAt      DateTime             @default(now()) @map("first_seen_at")
--     lastAttemptAt    DateTime?            @map("last_attempt_at")
--     appliedAt        DateTime?            @map("applied_at")
--     resolvedById     String?              @map("resolved_by_id") @db.Uuid
--     resolvedAt       DateTime?            @map("resolved_at")
--     resolutionNote   String?              @map("resolution_note")
--     @@index([status])
--     @@index([kind, status])
--     @@index([status, clientRecordedAt])
--     @@map("mis_queued_writes")
--   }
--
-- THE RULE THIS TABLE ONLY WORKS UNDER (§B.7): the row here and the business
-- row it deduplicates must be written in the SAME database transaction. A
-- crash between the two makes the dedupe a lie — the production log exists,
-- the key does not, and the retry duplicates it. `logProduction()` currently
-- creates its row and audits outside a transaction; Phase 11 brings both
-- inside one.
--
-- `device_id` is a plain scalar with no foreign key for now. Phase 12 adds
-- kiosk device enrolment; tightening this into a real FK afterwards is
-- additive and can be done then.
--
-- Then `pnpm db:generate`. `prisma generate`/`migrate` cannot run from the
-- agent shell (engine download is 403-blocked), so this must be run on the
-- Mac before any code references `MisQueuedWrite` — tsc will not compile
-- against a client that lacks it.
--
-- Rollback:
--   DROP INDEX IF EXISTS mis_queued_writes_status_recorded_idx;
--   DROP INDEX IF EXISTS mis_queued_writes_kind_status_idx;
--   DROP INDEX IF EXISTS mis_queued_writes_status_idx;
--   DROP TABLE IF EXISTS mis_queued_writes;
--   DROP TYPE IF EXISTS mis_queued_write_status;
