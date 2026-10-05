# Kiosk Android app — align backend (2026-10-05)

**Audience:** MIS platform Claude Code session. Android kiosk is ~95% feature-complete; read
this to align the backend/website side with what it now does.

## What the kiosk now does (all live-tested)
- Operator sign-in gate (K9) before punching — sends `payload.operatorId` on every punch
  (field already existed server-side, unused until now).
- End-shift handover (K11), read-only Shifts screen, offline-queue screen (K2).
- Punch in/out via QR scan + manual code entry, offline queue with auto-flush.
- Fixed: a race where two retry paths (WorkManager background flush + on-screen auto-replay)
  could both resend the same punch key concurrently — now guarded client-side, but worth
  confirming your `/punch` idempotency-by-key dedup is airtight on your end too, since it was
  the only thing saving a double-send before this fix.

## Ask
1. **Confirm `operatorId` is now actually useful** — is it stored/shown anywhere on the
   attendance dashboard? If not surfaced, that's dead data.
2. **Super Attendance Operator role** — kiosk can't build this. The `/pull` roster response has
   no role field at all (confirmed: `PULL_EMPLOYEE_KEYS` in `kiosk-device.ts` only selects
   `id, name, badgeCode, shift`). If you want a Super Operator distinction on the kiosk, `/pull`
   needs to start returning a role/employee-type field. Until then, this stays unbuilt — not a
   bug, just blocked on this.
3. **Double-check `/punch` idempotency under concurrent same-key requests** — see the race note
   above. Client no longer sends duplicates, but confirm server-side dedup still holds as
   defense-in-depth.

No other API contract changes needed — everything else is client-side.
