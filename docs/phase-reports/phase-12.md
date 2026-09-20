# Phase 12 · Kiosk device enrolment & master-data pull

**Date:** 2026-09-20   **Model:** sonnet   **Result:** DONE (Half A + Half B)
**Tickets:** MIS-225, MIS-243, MIS-244

## What was built
- **Half A:** `MisKioskDevice` (`prisma/schema.prisma`, migration `20260924000000_mis_kiosk_devices`, applied). Tokens and poll secrets stored hashed only.
- **MIS-243:** `src/server/mis/kiosk-device.ts` — request/approve/claim enrolment, `authenticateDevice`, revoke, rename, list, health summary, `pullForDevice`, `recordDeviceSync`. Thin routes `src/app/api/mis/kiosk/{enrol,enrol/claim,pull}/route.ts`. New action `kiosk.manage` (Owner, Admin). `src/lib/mis/kiosk-health.ts` holds D19's thresholds.
- **The auth exemption:** `src/lib/mis/kiosk-routes.ts` is an **exact** list of three paths, read by `src/lib/supabase/middleware.ts`. Nothing else skips the login redirect.
- **MIS-244:** `/mis/settings/devices` (pair, rename, retire, health), a Settings link (Owner/Admin only), and the attendance home's top card now reads real tablet staleness (green/amber/red, in words).
- Tests: 896 pass (was 752). Mutation-tested: revoked-may-pull, spread-the-row, reissue-token, drop-the-select, skip-token-shape-check each fail a named test.

## Decisions cited
D4/D5, D6, D15, D16. **New: D18, D19** (recorded in Half A).

## Honest limits
- **`enrol` cannot authenticate** — the tablet has no credential yet. It reads no MIS data, is capped at 20 pending, returns only its own code/secret, and does nothing until an Admin approves. `claim` proves itself by poll secret; `pull` by token.
- Not tested on a real tablet or browser; the Expo app is a separate codebase. The service worker was not relied on (`/api/**` is outside D16).
- Both haiku checkers returned PASS but their line references and counts were loose; my own mutation tests are the stronger evidence.

## Non-mis file edited
`src/lib/supabase/middleware.ts` — early return for the three kiosk paths. Reason: a tablet has no session cookie, so the login guard would redirect every call.

## What changed for later phases
Stamped: Phase 12 (built), Phase 13 (punch route must be added to `KIOSK_DEVICE_ROUTES` and use `allowRevoked`), Phase 19 (QA items).

## Pending — the next agent must do this first
Human: pair one real tablet against a deployed build; probe `/api/mis/**` signed-out. Phase 13: add the punch route by exact path to `kiosk-routes.ts` and its test.

## Files to attach to the next phase
`DEVELOPMENT_GUIDE.md`, `MIS_UI_SPEC.md`, `DECISIONS.md`, `PHASE_LOG.md`, `phase-reports/phase-12.md`, `Arjun/design/screens/K1-Scan-confirm.png`, `K2-Offline-sync-queue.png`
