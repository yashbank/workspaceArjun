# Phase 13 · Kiosk punch ingestion & sync

**Date:** 2026-09-20   **Model:** sonnet   **Result:** DONE (Half A + Half B). Nothing has run on a real tablet.
**Tickets:** MIS-224, MIS-240, MIS-241

## What was built
- **Schema (Half A):** `MisAttendancePunch` — immutable (a trigger refuses UPDATE/DELETE); corrections are new rows.
- **MIS-240:** `src/server/mis/attendance-punch.ts` — `ingestDevicePunch` (device token; a retired tablet's punches accepted and flagged, D18) and `submitPunch` (portal session), both via `runIdempotent`. Route `/api/mis/kiosk/punch`, the fourth **exact** entry in `KIOSK_DEVICE_ROUTES`. A day is derived from punches (`attendance-day.ts`), never patched. Punch time is the device's (D15); outside tolerance it parks, never clamps — tested both ways.
- **D22:** `factory.timezone` rule (seeded `Asia/Kolkata`, `IST` refused as ambiguous), `factory-time.ts` on built-in `Intl` (no dependency). `attendance-day`, `shift-window`, the punch path and the kiosk pull all resolve through it; a test shows one instant filing under different days in two zones, and a source scan bans `getHours`/`setHours` in those files.
- **MIS-241:** `/mis/kiosk` rebuilt on the ONE shared queue — offline banner that never blocks scanning, bilingual "Carry on as normal", the K2 panel (sent / total, original punch times, failed row, retry countdown), Fix for an unrecognised badge only.
- **Lateness/overtime are still computed nowhere** (D20).

## Bugs found in earlier phases
- **Phase 10 queue:** a punch's predecessor was tracked per *kind*, so one unrecognised badge would park **every other person's clock-out** — the failure K2 is designed against. Now per person; failing-first test.
- **Phase 12 pull:** resolved "today" on the server's clock (D22). Fixed.
- **~20 other sites still bucket by server time** (payroll months, QC slots, day summaries); listed in the Phase 20 stamp, untouched — payroll is money.

## Decisions
Cited D5, D15–D19. New: **D20, D21, D23**; **D22** applied (D21's timezone line reconciled to it).

## Verification, honestly
`tsc` silent; 1097 tests; `pnpm build` passes. Mutation-tested: 12 on ingestion (two survivors found and fixed), 6 on day derivation, 5 on the screen (one exposed dead code, removed). **Haiku checkers:** MIS-240 PASS with some wrong citations; MIS-241 "PASS 11/11" with an empty NOT-VERIFIED list, which fails the tightened bar — I rely on my own tests.

## Pending — the next agent must do this first
Human: confirm IST with Arjun (D22); put a real tablet on the gate and airplane-mode it; native Android wrapper not in scope. Phase 20: the timezone sweep. Phase 23: punch overrides and the correction function (not built).

## Files to attach to the next phase
`DEVELOPMENT_GUIDE.md`, `MIS_UI_SPEC.md`, `DECISIONS.md`, `PHASE_LOG.md`, `phase-reports/phase-13.md`
