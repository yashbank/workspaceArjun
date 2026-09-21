# Phase 24F · Browser walkthrough & fix

**Date:** 2026-09-22   **Model:** sonnet (builder and checker)   **Result:** DONE for what it set out to do — every `/mis` route opens for every role at 390 and 1440 px; three things are logged, not fixed (tap targets, the phone menu, the payslip id guard)
**Tickets:** Phase 24F (no Jira ticket). Findings F-24 – F-28 (`qa/FINDINGS.md`). The walk itself: `qa/WALKTHROUGH-24F.md`.

## What was built
- **The walk.** Eight temporary logins (one per MIS role) were created, the real app was driven in headless Chrome at 390×844 and 1440×900, every `/mis` route was loaded for every role, and the results are in `qa/WALKTHROUGH-24F.md` (round 1: before, round 2: after). The logins were deleted afterwards; loading pages wrote no rows.
- **Store, Inventory and GRN now open (F-24).** Three causes: one query per item on a one-connection pool (`server/mis/store.ts` `getStockBalances`, `server/mis/inventory.ts` `getInventorySummary`); a Prisma `Decimal` handed to a client component on five pages (`lib/mis/plain.ts` `toPlain`, applied on the GRN, BOM, PO, item-master and reports pages); a GRN list that asked a Supervisor for purchase orders (`app/(mis)/mis/grn/page.tsx`).
- **Bad ids answer 404 (F-25).** `lib/mis/ids.ts` `isUuid` on 18 `[id]` pages and on the two `[orderId]` API routes — which also returned 500/404 for a refused role instead of 403.
- **Screens that rendered wrong (F-26).** Search boxes and filter controls on 20+ screens brought to 48 px / 16 px / white (design sheet 06); `DataTable` scrolls inside its own box (Employees was 275 px too wide); a hydration mismatch removed (`formatFactoryDate` / `formatFactoryDateTime` in `lib/mis/factory-time.ts`); D10–D13 fields got a text colour; the D13 detail pane wraps properly.
- **Logged, not changed:** F-27 (a phone cannot reach Store/Inventory/GRN/PO/Suppliers for Owner, Admin, Supervisor — the design's own phone tabs), F-28 (every refusal writes 6 console errors), tap targets under 44 px (in F-26), and the payslip page's id guard (its existing test uses the id `'e1'`).

## Decisions cited
D22 (factory zone — the date formatters), D24 (nothing added to any payload: `toPlain` runs after `withoutMoneyFields` / `forRole`; the store price/value branches are untouched and `store-money.test.ts` still proves all 8 roles), D5 (unchanged), D30/D31 (rules page and documents were walked; both behave as designed). **No new D-number:** nothing here is a policy choice. F-15 was not touched.

## Tests (each fix has one that fails without it)
`store-pool.test.ts` (9 of 10 cases fail on the old code), `client-props.test.tsx` (fails per page without `toPlain` — proven by reverting each page), `grn/page.test.tsx` (all 8 roles, uses the real permission matrix), `dynamic-route-guards.test.ts` (reads the source of every dynamic page), `ids.test.ts`, `plain.test.ts`, `data-table.test.tsx`, `search-inputs.test.ts` (reads every screen's source), `api/mis/id-routes.test.ts`, additions to `factory-time.test.ts`.
**One existing test file was edited, on purpose:** `store-money.test.ts`'s fake database gained `$queryRaw` (its assertions are unchanged) because the code now asks for balances that way. The payslip page was left unguarded rather than edit `wage-screens.test.tsx`.

## What changed for later phases
- `DEVELOPMENT_GUIDE.md` **§2A.13** (new): `timeout exceeded when trying to connect` — never one query per row on a whole-list page (the pool is one wide).
- **Phase 25** stamped (see there): pool width, `toPlain`, `isUuid`, the payslip page and `formatFactoryDate`.
- **Phase 20/21 (store, PO)** are told the same in F-24; Phase 24F's own section is marked done.

## Verification, honestly
`tsc --noEmit --skipLibCheck` prints **nothing**. `pnpm vitest run` **172 files, 3868 passed + 10 expected-fail** (24E ended at 163 / 3740 / 10: +9 files, +128 tests). `pnpm build` passes. ESLint: the files I added are clean; `src/components` + `src/app` already carried **89 errors** (mostly `no-explicit-any`) before this phase — not addressed. The checker (sonnet) passed FE and BE with minors only; its fixes (API route 403, `flex-wrap`, focus rings, wording, finding citations) are in.
**Round 2 of the walk found nothing left to crash.** **Not verified:** a real phone (390 px is emulated, mouse events, no touch), other browsers, `next start` (the walk used the dev server), form submissions/writes, the Hindi locale, offline behaviour.

## Pending — the next agent must do this first
1. **Phase 25** (schema gate). Read the 24F stamp on it: it touches nothing you build on, but a new whole-list page must not query per row.
2. **Decide with Arjun:** F-27 (how does a phone reach Store/GRN/PO/Inventory?), F-15, D30, D31 and the earlier list in `phase-reports/phase-24.md`.
3. **Later, small:** tap targets under 44 px on the store and GRN lists (F-26 (a)); give `wage-screens.test.tsx` a UUID fixture, then guard the payslip page (F-25); composite index `(item_id, created_at DESC)` on the two ledgers when a schema phase comes (F-24).

## Files to attach to the next phase
`DEVELOPMENT_GUIDE.md`, `MIS_UI_SPEC.md`, `DECISIONS.md`, `PHASE_LOG.md`, `phase-reports/phase-24F.md`, `qa/FINDINGS.md`, `qa/WALKTHROUGH-24F.md`
