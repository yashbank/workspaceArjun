-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. To promote it (the human, from Arjun/app):
--
--   mv prisma/migrations-pending/20260924000000_mis_kiosk_devices \
--      prisma/migrations/20260924000000_mis_kiosk_devices
--   pnpm db:deploy && pnpm db:generate
--
-- Phase 12 · gate-tablet enrolment (MIS-243). The design is K10 (pairing) and K12
-- (device health); the decisions are D18 (how a tablet is enrolled and who may do
-- it) and D19 (what a tablet may pull, and what "stale" means).
--
-- New table and enum only. Nothing existing is altered, so there is nothing to
-- backfill and no live row changes meaning.

CREATE TYPE mis_kiosk_device_status AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

CREATE TABLE mis_kiosk_devices (
  id                 uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  status             mis_kiosk_device_status NOT NULL DEFAULT 'PENDING',

  -- Set by the Admin at approval ("GATE-01"). Null while PENDING.
  name               text,
  -- What the tablet says it is ("Samsung Tab A9 · Android 14"). Informational
  -- only, device-reported, never used to make a decision.
  hardware_label     text,

  -- The code the tablet shows and an Admin types (K10). Unique while it exists;
  -- cleared the moment it is used or expires, so a spent code is never live.
  pairing_code       text UNIQUE,
  pairing_expires_at timestamp with time zone,

  -- SHA-256 of a random 32-byte secret the tablet generated. Lets the tablet — and
  -- only the tablet — collect its token once the Admin has approved. Not a
  -- password, so no slow hash: it is 256 bits of entropy, unguessable.
  poll_secret_hash   text NOT NULL,
  -- SHA-256 of the bearer token. The token itself is returned to the tablet exactly
  -- once and never stored, so reading this table cannot impersonate a device.
  -- Unique: it is also the lookup key on every authenticated request.
  token_hash         text UNIQUE,
  token_issued_at    timestamp with time zone,

  -- People are plain uuids, no foreign key (Phases 7-10): an audited approval must
  -- outlive the person who gave it.
  approved_by_id     uuid,
  approved_at        timestamp with time zone,
  revoked_by_id      uuid,
  revoked_at         timestamp with time zone,
  revoked_reason     text,

  -- Staleness (K12, MIS_UI_SPEC §4.2). last_sync_at = last SUCCESSFUL sync, the
  -- value the attendance-home card turns green / amber / red from. last_pull_at =
  -- how old the tablet's employee list is.
  last_sync_at       timestamp with time zone,
  last_pull_at       timestamp with time zone,

  -- The device's own last self-report: a snapshot, not a history.
  app_version        text,
  battery_percent    integer,
  is_charging        boolean,
  queued_punches     integer,
  health_reported_at timestamp with time zone,

  created_at         timestamp with time zone NOT NULL DEFAULT now(),
  updated_at         timestamp with time zone NOT NULL DEFAULT now(),

  -- Each status is only legal with the columns it needs. A PENDING row with no
  -- code could never be approved; an ACTIVE row with no name would be an
  -- anonymous tablet on the punch report; a REVOKED row with no time is a revoke
  -- nobody can date.
  CONSTRAINT mis_kiosk_devices_pending_needs_code
    CHECK (status <> 'PENDING' OR (pairing_code IS NOT NULL AND pairing_expires_at IS NOT NULL)),
  CONSTRAINT mis_kiosk_devices_active_needs_name
    CHECK (status <> 'ACTIVE' OR (name IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT mis_kiosk_devices_revoked_needs_time
    CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL),
  CONSTRAINT mis_kiosk_devices_battery_range
    CHECK (battery_percent IS NULL OR (battery_percent BETWEEN 0 AND 100)),
  CONSTRAINT mis_kiosk_devices_queued_nonneg
    CHECK (queued_punches IS NULL OR queued_punches >= 0)
);

-- Two live tablets must never both be "GATE-01": the punch report and the health
-- card identify a device by name. A retired tablet's name is free again — and
-- Prisma cannot express a partial expression index, so this lives only here.
CREATE UNIQUE INDEX mis_kiosk_devices_name_live_uniq
  ON mis_kiosk_devices (lower(name))
  WHERE status <> 'REVOKED' AND name IS NOT NULL;

CREATE INDEX mis_kiosk_devices_status_idx ON mis_kiosk_devices (status);
-- "Which pending codes have expired?" — the sweep that keeps unauthenticated
-- enrolment requests from piling up.
CREATE INDEX mis_kiosk_devices_status_expiry_idx ON mis_kiosk_devices (status, pairing_expires_at);

-- Prisma side (schema.prisma), already added in the same change:
--   enum MisKioskDeviceStatus { PENDING ACTIVE REVOKED  @@map("mis_kiosk_device_status") }
--   model MisKioskDevice { ... @@map("mis_kiosk_devices") }
-- The partial unique index and the CHECK constraints are deliberately SQL-only.
--
-- `mis_queued_writes.device_id` (Phase 10) stays a plain text column. Phase 13 may
-- tighten it into a real reference to this table; that is additive and belongs there.
--
-- `prisma generate` cannot run from the agent shell, so this must be promoted and
-- generated on the Mac before any code references `MisKioskDevice`.
--
-- Rollback:
--   DROP INDEX IF EXISTS mis_kiosk_devices_status_expiry_idx;
--   DROP INDEX IF EXISTS mis_kiosk_devices_status_idx;
--   DROP INDEX IF EXISTS mis_kiosk_devices_name_live_uniq;
--   DROP TABLE IF EXISTS mis_kiosk_devices;
--   DROP TYPE IF EXISTS mis_kiosk_device_status;
