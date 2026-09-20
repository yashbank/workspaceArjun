-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. To promote it (the human, from Arjun/app):
--
--   mv prisma/migrations-pending/20260925000000_mis_attendance_punches \
--      prisma/migrations/20260925000000_mis_attendance_punches
--   pnpm db:deploy && pnpm db:generate
--
-- Phase 13 · the punch ledger (MIS-240). Design: K1 and K2. Decisions: D20 (what a
-- punch is and how a day is derived from punches), D21 (corrections, the correction
-- window, and what this phase deliberately does NOT compute).
--
-- New table, enum and trigger only. Nothing existing is altered, so there is
-- nothing to backfill and no live attendance row changes meaning. Existing
-- mis_attendance rows keep working exactly as before; they simply have no punches
-- behind them.

CREATE TYPE mis_punch_direction AS ENUM ('IN', 'OUT');

CREATE TABLE mis_attendance_punches (
  id                  uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The client's idempotency key, equal to the mis_queued_writes key (Appendix B
  -- §B.2). Unique here as a second net under the transactional claim (§B.7): two
  -- racing replays can never both leave a punch behind.
  idempotency_key     uuid NOT NULL UNIQUE,

  employee_id         uuid NOT NULL REFERENCES mis_employees (id),
  direction           mis_punch_direction NOT NULL,

  -- What the DEVICE said, raw, never clamped to now() (D15). A punch outside the
  -- clock tolerance never reaches this table — it is parked for a person.
  punched_at          timestamp with time zone NOT NULL,
  -- The server's clock on arrival. Evidence only; it never feeds a business figure.
  received_at         timestamp with time zone NOT NULL DEFAULT now(),

  device_id           uuid REFERENCES mis_kiosk_devices (id),
  -- True when the tablet was retired before this punch synced (D18). Accepted, and
  -- flagged, because the punch is a real event.
  from_revoked_device boolean NOT NULL DEFAULT false,
  -- The gate operator who confirmed the face (K1, K9). A claim recorded as evidence.
  operator_id         uuid,
  -- The signed-in user, when the punch came through the portal and not a device.
  recorded_by_id      uuid,
  -- The shift the device says the person is on. Disambiguates an early arrival that
  -- falls inside the previous shift's window; validated by the server, never trusted blind.
  shift_id            uuid,

  -- A correction is a NEW row pointing at the row it replaces (K2). UNIQUE: a
  -- punch is superseded at most once. Active punches = those nothing supersedes.
  supersedes_id       uuid UNIQUE REFERENCES mis_attendance_punches (id),
  correction_reason   text,
  corrected_by_id     uuid,

  -- A correction always says why and who; an ordinary punch carries neither.
  CONSTRAINT mis_attendance_punches_correction_complete CHECK (
    (supersedes_id IS NULL AND correction_reason IS NULL AND corrected_by_id IS NULL)
    OR
    (supersedes_id IS NOT NULL AND btrim(correction_reason) <> '' AND corrected_by_id IS NOT NULL)
  ),
  -- Only one channel: a device OR a signed-in user, never both, never neither for
  -- an ordinary punch. (Corrections are made by a person, so are exempt.)
  CONSTRAINT mis_attendance_punches_one_source CHECK (
    supersedes_id IS NOT NULL
    OR (device_id IS NOT NULL AND recorded_by_id IS NULL)
    OR (device_id IS NULL AND recorded_by_id IS NOT NULL)
  )
);

-- "This person's punches around this time" — the query behind every day rebuild.
CREATE INDEX mis_attendance_punches_employee_time_idx ON mis_attendance_punches (employee_id, punched_at);
-- "What has this tablet sent?" — the device list and any later audit of one tablet.
CREATE INDEX mis_attendance_punches_device_received_idx ON mis_attendance_punches (device_id, received_at);

-- ---------------------------------------------------------------------------
-- IMMUTABILITY (K2: "nothing here is ever overwritten in place").
--
-- Attendance decides pay. A punch that could be edited or deleted after the fact
-- would let the record of who was at the gate be reconstructed. So the database
-- refuses it, for every writer — the server module, a seed script, a psql session
-- and the code path nobody remembered — exactly as mis_job_phase_gate does for
-- the phase handover (MIS_UI_SPEC §7.1). A correction is an INSERT.
--
-- TRUNCATE is not a row operation and is not blocked: a workspace reset script
-- must still be able to clear the table.
-- ---------------------------------------------------------------------------
CREATE FUNCTION mis_attendance_punch_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'mis_attendance_punch_immutable: punches are never % — record a correction instead', lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER mis_attendance_punch_immutable
  BEFORE UPDATE OR DELETE ON mis_attendance_punches
  FOR EACH ROW EXECUTE FUNCTION mis_attendance_punch_immutable();

-- Prisma side (schema.prisma), already added in the same change:
--   enum MisPunchDirection { IN OUT  @@map("mis_punch_direction") }
--   model MisAttendancePunch { ... @@map("mis_attendance_punches") }
--   plus back-relations `punches` on MisEmployee and MisKioskDevice (no columns).
-- The trigger and both CHECK constraints are deliberately SQL-only.
--
-- `mis_queued_writes.device_id` (Phase 10) is still plain text and stays that way.
--
-- `prisma generate` cannot run from the agent shell, so this must be promoted and
-- generated on the Mac before any code references `MisAttendancePunch`.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS mis_attendance_punch_immutable ON mis_attendance_punches;
--   DROP FUNCTION IF EXISTS mis_attendance_punch_immutable();
--   DROP INDEX IF EXISTS mis_attendance_punches_device_received_idx;
--   DROP INDEX IF EXISTS mis_attendance_punches_employee_time_idx;
--   DROP TABLE IF EXISTS mis_attendance_punches;
--   DROP TYPE IF EXISTS mis_punch_direction;
