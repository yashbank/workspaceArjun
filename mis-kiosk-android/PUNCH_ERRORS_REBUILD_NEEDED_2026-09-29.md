# Punch errors on last test — backend verified healthy, APK needs a rebuild

**Audience:** whoever picks up Android work next. A punch test just showed errors in the app —
this file is the verification of what's actually true on the backend, and what to do next.

## Backend side: verified correct, nothing pending

- `git log origin/main` — `main` is fully merged, **0 commits behind `phase-a`**. Every backend
  and Android fix pushed so far (cold-start region pin, badge QR, live in/out screen, kiosk-screen
  crash fix, the punch race-condition fix below) is live.
- Queried the DB directly: **35/35 punch attempts in the last 2 hours landed as `APPLIED`**, zero
  parked, zero rejected, zero errors. The `/api/mis/kiosk/punch` and `/pull` endpoints are
  healthy right now.

**Conclusion: the errors you saw were not the backend.** They match a client-side bug that was
already found and fixed in source — see below — but not yet in the build on your emulator.

## What already got fixed (commit `b840202`, already on `main`)

An earlier Android-side session found and fixed a real bug: the submission overlay's scrim didn't
block touches to the screen behind it, so a second punch could start while the first was still in
flight and race the shared submission state — this was the actual cause of "sometimes no in/out
gets recorded." That commit also:
- Added a re-entrancy guard in `beginAttempt()`/`retry()`.
- Added SEND/DONE outcome logging in `PunchRepository` for Logcat.
- Tightened the API timeout 12s→6s and the retry-prompt auto-replay 30s→8s, now that the backend
  is consistently fast (region pinned to Singapore, see `BACKEND_UPDATE_2026-09-29.md`).

**If your emulator's APK was built before this commit, you were testing the known-broken build.**

## What to do

1. Pull latest, rebuild the APK from current `main`/`phase-a` HEAD, fresh install on a newly
   booted emulator.
2. Pair as a new device (HANDOVER.md §4.1-4.2).
3. Re-run the reliability sweep this fix claims to have already passed — confirm it still holds
   after a clean rebuild, don't just take the commit message's word for it:
   - Rapid same-employee taps (should send once, not multiple times).
   - Rapid multi-employee sequence.
   - Airplane-mode queue + reconnect auto-flush.
   - QR scan and manual entry both.
   - ~20 punches back-to-back — expect 20/20 applied, 0 retries.
4. If you still see an error after the rebuild, capture the exact Logcat output and the wall-clock
   time of the punch — the backend DB can be queried directly to confirm whether the request ever
   reached the server at all, which immediately tells you client vs. server.
