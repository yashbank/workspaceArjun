# Android kiosk: operator sign-in added (commit 3656bd4, branch phase-a)

**Audience:** the MIS platform Claude Code session, to adopt/integrate this change.

## What changed, Android-side

- New operator sign-in screen (K9): before punching anyone, the kiosk operator enters their own
  employee code once. Their id is then sent as `payload.operatorId` on every punch they process.
- `operatorId` uses the field `attendance-punch.ts` already declares (line ~60, "the gate operator
  who confirmed the face (K1, K9)", optional per D21) — **no backend change needed**, just now
  actually populated by the client.
- End-shift/handover (K11): a button in the device health screen clears the signed-in operator,
  requiring the next operator to sign in fresh.
- Out-approval (K5) intentionally not built — the attendance operator's own sign-in is the
  accountability mechanism; no separate approval step.
- Not persisted in the offline queue: `operatorId` rides on the live attempt only. A punch that
  gets queued and flushed later (after a network drop) resends without it — acceptable since it's
  optional and rare.

## Ask

1. Confirm the admin dashboard's attendance views can already show `operatorId` per punch (it's
   already in the punch record if `attendance-punch.ts` stores it) — if not surfaced anywhere in
   the UI yet, that's a natural next step so this data is actually useful to someone.
2. No API contract changes were made. Nothing to redeploy for this specifically.
3. For continued speed/reliability work: the Android app's `PunchRepository` now logs every
   SEND/DONE with duration to Logcat — if punch latency regresses again, that's the fastest way
   to tell client vs. server (see the pattern used in `PUNCH_500_2026-09-29.md` and
   `BACKEND_UPDATE_2026-09-29.md` for how prior issues were isolated this way).
