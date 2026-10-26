-- Tester-tracker rows 161-176 follow-up — minimal auditable shift-handover record.
-- New table only; nothing existing is altered. Derived server-side from the operatorId
-- already carried on every punch (K9/R3 B57) — no kiosk app or API change needed.
-- Soft references (no FK constraints), matching operator_id/device_id on
-- mis_attendance_punches, which are also unconstrained.

CREATE TABLE IF NOT EXISTS mis_shift_handovers (
  id                uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         uuid NOT NULL,
  from_operator_id  uuid,
  to_operator_id    uuid NOT NULL,
  shift_id          uuid,
  occurred_at       TIMESTAMP(3) NOT NULL,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mis_shift_handovers_device_id_occurred_at_idx
  ON mis_shift_handovers (device_id, occurred_at);

-- Rollback: DROP TABLE IF EXISTS mis_shift_handovers;
