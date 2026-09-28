# Backend update — cold starts + badge QR (2026-09-29)

**Audience:** whoever picks up Android-side testing/work next. Read this before touching code —
it explains what changed on the server and why re-testing from a fresh pair is required.

## What changed, backend-side

1. **Cold-start latency (HANDOVER.md's known `/punch` 4-8s problem).** Root cause was a region
   mismatch: the Supabase DB is in `ap-southeast-1` (Singapore), but the Vercel deployment had no
   region pin and ran on the US-East default. A punch does 5-10+ sequential DB round trips
   (auth device → idempotency transaction → audit log) — each one paying full trans-Pacific
   latency. Fixed by adding `app/vercel.json`: pins the deployment to `sin1` (Singapore) and
   explicitly enables Fluid Compute. **No API contract change** — same endpoints, same request/
   response shapes, just faster.
2. **Badge QR codes never actually worked.** The web portal's badge print page
   (`/mis/print/badge/<id>`) was drawing a decorative SVG placeholder — three corner squares and
   plain text, not a real QR — so **no printed badge before today had a scannable QR on it,
   ever**. It now renders a real QR (via the `qrcode` npm package) encoding exactly the plain
   `badgeCode` string, matching what the app's scanner already expects. No Android code was
   broken; there was simply nothing valid to scan before.

**No changes were made to the four `/api/mis/kiosk/*` routes' request/response shapes, auth, or
idempotency rules.** HANDOVER.md §4 is still accurate as-is.

## ⚠️ Before you test: which deployment is the app pointed at

`app/build.gradle.kts` hardcodes `API_BASE_URL = "https://workspace-arjun.vercel.app"` — that's
**production**, which deploys from `main`. Both fixes above are currently only on the `phase-a`
branch (pushed, not yet merged). **Testing against the current build will NOT show either fix**
until one of:
- `phase-a` is merged into `main` and production redeploys, or
- `API_BASE_URL` is temporarily pointed at the `phase-a` preview deployment URL (check the Vercel
  dashboard for the preview URL from the latest `phase-a` push) for this test pass only.

Confirm which one is true before drawing any conclusion from a test run.

## Also true right now

- All previously-paired kiosk devices have been removed/revoked. There is no valid device token
  anywhere — every emulator/tablet needs to go through pairing (HANDOVER.md §4.1-4.2) fresh.
- Print at least one fresh badge from the portal to scan against — any badge printed before today
  has the old, non-scannable placeholder graphic baked into the PDF/print output.
