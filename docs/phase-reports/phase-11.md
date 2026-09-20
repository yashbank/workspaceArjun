# Phase 11 · Offline production entry

**Date:** 2026-09-20   **Model:** sonnet   **Result:** DONE (service worker not exercised in a real browser — see Pending)
**Tickets:** MIS-139, MIS-154, MIS-155

## What was built
- **Server (MIS-154):** `src/server/mis/idempotency.ts` rewritten claim-first — business row and key row commit in one transaction, race loser returns the winner's result. `src/server/mis/production.ts`: `submitProductionLog` (five checks, Appendix A §A.8), live vs replay modes, actor = `queuedBy` and must equal the signed-in user. `orders.ts`: `reopenOrder`. Single closed-status list: `src/lib/mis/order-status.ts`.
- **Central claim:** `production.test.ts` "queued under a valid clearance, replayed after it expired → PARKS", end-to-end through the real `OfflineQueue`. Mutation-tested: breaking it fails loudly.
- **Screens (MIS-155):** `production-screen.tsx`, `production-detail-screen.tsx` via `submit-production.ts` (live first, 8s timeout, then queue under the **same** key). One key per form session, so a double-tap cannot double-log. "Lists as of HH:MM" when offline or >5 min old.
- **Service worker:** `public/sw.js`, registered by `shell/service-worker-registration.tsx` (production only). Pinned by `sw.test.ts` (41 tests; widening the list fails 3).
- **Retry:** `canRetry()` in `queue.ts` mirrors the server (D17).

## Decisions cited
D7, D8, D10, D11, D12, D15. **New: D14** (closed order refuses production; `reopenOrder`), **D16** (the exact worker routes), **D17** (which parks a human may retry). Appendix B §B.10 added.

## Two earlier-phase bugs found and fixed
- **Phase 10:** dedupe used `upsert` and could double-apply under concurrency. Replaced; proven with a fake DB.
- **Phase 6:** screens read `err.message`, which production builds replace with a generic string. Phase 11's actions now **return** outcomes (`clearLineAction`, `reopenOrderAction`, both submit actions). Other older screens may still rely on `err.message` — not audited.

## What changed for later phases
Stamps left on: Appendix A §A.8, Phases 12, 13, 17, 22 (inbox: retry half done; override and cross-device inbox remain).

## Non-mis file edited
`src/proxy.ts` — matcher exempts `sw.js`; otherwise the auth guard redirects the worker script to /login and it never installs.

## Pending — the next agent must do this first
Human: (1) airplane-mode check of the service worker on a real device (build, sign in, open both routes, go offline, reload each; expect cached page + banner; open `/mis/orders` offline, expect the inline offline page); (2) decide the **two "Phase 22" sections** — renumber the inbox to 23 (recommended) — and raise its Jira ticket. Phase 13: register punch senders in `offline-senders.ts`; add **no** routes to `sw.js`.

## Files to attach to the next phase
`DEVELOPMENT_GUIDE.md`, `MIS_UI_SPEC.md`, `DECISIONS.md`, `PHASE_LOG.md`, `phase-reports/phase-11.md`
