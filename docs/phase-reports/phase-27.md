# Phase 27 · MIS-82 fix — the missing PWA icons

**Date:** 2026-09-27   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-82 ("Manifest, icons and service-worker registration") — an orphaned ticket, not
assigned to any phase in `DEVELOPMENT_GUIDE.md`; picked up directly at Arjun's request after this
session's own Phase 26 traced "the factory MIS icon is missing" to it.

## What was found
`public/manifest.json` already existed (`"description": "Factory MIS for Bhaskar Paper
Products"`) and named two icon files, `/assets/icon-192.png` and `/assets/icon-512.png` —
neither existed on disk, confirmed 404 live. Separately, `/manifest.json` itself 307-redirected
to `/login` for a signed-out request (`src/proxy.ts`'s matcher had no exemption for it, unlike
`sw.js`) — a manifest fetched via redirect is invalid per spec, so no browser would ever have
shown an install prompt or icon even once the files existed. The service worker itself
(`public/sw.js`, `service-worker-registration.tsx`) was already built and registered — MIS-82's
"PARTIAL" status in `TICKET_INVENTORY.md` was accurate; only the icons and the route were missing.

## What was built
- **`scripts/generate-pwa-icons.mjs`** (new, one-off, not part of the build) — no distinct
  "Factory MIS"/BPP logo asset exists anywhere in the repo (checked
  `public/assets/bpp/references/`: design mockups for the unrelated file-manager app, no logo
  mark). Rather than invent new branding, this reuses the manifest's own already-decided identity
  fields (`theme_color` #1e293b, `background_color` #faf9f9, `short_name` "BPP") — a
  maskable-safe solid square with "BPP" centred, generated via `sharp` (already a dependency).
  Produced `public/assets/icon-192.png` and `icon-512.png`.
- **`src/proxy.ts`** — added `manifest\.json` to the matcher's exemption list, alongside `sw.js`,
  with the same reasoning (D16).

## Decisions cited
D16 (public static assets bypass the auth guard) — extended, not reinterpreted, to cover the
manifest itself.

## Honest note
The icon is a placeholder — solid colour + text, not a designed logo. If Arjun wants real BPP
branding (a mark, not just the initials), that is a design asset to provide, not something to
invent here; swapping it later is a one-file change (`scripts/generate-pwa-icons.mjs`, or replace
the two PNGs directly).

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: 193 files, 4221 passed + 9
expected-fail (unchanged — no test covers the proxy matcher regex or icon files). `pnpm build`:
passes, every route.

## What changed for later phases
None.

## Pending
Nothing. A real logo (cosmetic) is optional future work, not a blocker.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-27.md
- Arjun/app/docs/qa/FINDINGS.md
