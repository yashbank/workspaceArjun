# Phase 24G · UI polish

**Date:** 2026-09-22   **Model:** sonnet (four build agents, one lead)   **Result:** DONE
**Tickets:** Phase 24G (no Jira ticket). Findings: F-25, F-27 closed; F-29–F-33 filed (`qa/FINDINGS.md`). New decision: D32. Gap log: `qa/UI-GAPS-24G.md`.

## What was built
- **The walk.** Eight temporary logins (one per role, same method as 24F) drove the real app in headless Chrome at 390×844, 768×1024, 1024×768 and 1440×900 — 8 roles × 65 routes × 4 widths (2,112 loads). Zero crashes, zero console exceptions, zero page-level horizontal overflow. Measured every load for tap targets under 44 px, input font under 16 px, and elements clipped past the right edge, then screenshotted every route for the Owner and every failing case for every role. Logins deleted afterwards; the walk wrote zero business-rule, audit or store-transaction rows.
- **The screens were split into four parts by area and fixed in parallel** against `design/screens/` (map in `.tmp-wt/design-map.txt`): Part 1 (shared kit, shell, dashboard, role homes), Part 2 (orders/production/QC/BOM/reports/approvals/print), Part 3 (masters/attendance/employees/settings/payroll), Part 4 (store/GRN/PO/suppliers). Full table in `qa/UI-GAPS-24G.md` (63 gaps logged; most fixed).
- **F-27 → D32: phone "More" tab.** Owner, Admin and Supervisor now get a "More" fifth tab (bottom sheet) listing every screen their role may open, sourced from the same permission table (`navigationForRole`, `server/mis/navigation.ts`) the desktop sidebar reads — the two cannot disagree. New: `lib/mis/phone-more.ts`, `components/mis/home/more-sheet.tsx`.
- **F-25 closed:** the payslip page (`print/payslip/[employeeId]`) is now `isUuid`-guarded like the other 18 `[id]` pages. `wage-screens.test.tsx`'s `'e1'` fixture became a UUID (edit disclosed).
- **Real bugs found beyond the tap-target sweep, all fixed:** invisible `<h1>`/text headings on 5 screens (no text-color class); a stale order-status enum on 3 screens that always showed the generic grey badge and a permanently-zero "Delivered" count; a duplicated BOM material label; the desktop sidebar's `overflow-y-auto` never engaging (`min-h-0` missing on a flex child), hiding the active nav item behind the footer; `MasterNavSidebar` passing a translator FUNCTION from a server component into a client component (`masters/page.tsx` → crashed "Something went wrong" at every width) — found on my own re-walk after the four agents finished, fixed by having the component call `useT()` itself.
- **kit `Button` primary colour** was near-black (`bg-slate-900`); MIS_UI_SPEC §4.3 calls for indigo — fixed at the kit level (~214 call sites).

## Decisions cited
D1/D3 (two layouts, 1024px the only boundary — respected throughout), D24 (money stayed absent for non-Owner roles everywhere checked, including the STORE_GUY receive-cart rate field, which is a known write-side question, F-15, not a render leak). **New: D32** — Owner/Admin/Supervisor phones show "More" as the fifth tab; the tab it displaces moves inside it.

## Left, logged with reasons (`qa/UI-GAPS-24G.md`, F-29–F-33)
Structural mismatches that need a new component, not a layout fix: no UI at all for the notification inbox W1 (F-29); `/mis/production/[id]` doesn't implement P4's two-tap keypad flow (F-30); `/mis/machine-board/[id]` has no D5 day-timeline (F-31); `/mis/approvals` doesn't match P5's grouped-by-order queue (F-32); `/mis/payroll` doesn't match its own design W9 and has no phone card view (F-33). Also: ~60 timezone-less `toLocale*` calls remain (F-26, re-confirmed); `DataTable`'s `md` breakpoint is unchanged.

## Tests
Each part added source-scanning guard tests for its tap-target/typography fixes (they fail if reverted — confirmed per-part by the build agents): `navigation-more.test.ts`, `more-tab.test.tsx`, `relative-age.test.ts`, `cards.test.tsx`, `owner-home.test.tsx`, `mis-shell.test.tsx`, `button.test.tsx`, `orders/heading-text-color.test.ts`, `orders/tap-targets.test.ts`, `employees/tap-targets-24g.test.ts`, `store/store-tap-targets.test.ts`, `print/payslip/payslip-id-guard.test.ts`. No existing test was edited except the disclosed `wage-screens.test.tsx`/`wage-world.ts` UUID fixture and `dynamic-route-guards.test.ts` losing the payslip exception.

## Verification, honestly
`tsc --noEmit --skipLibCheck` prints **nothing**. `pnpm vitest run`: **184 files, 3984 passed + 10 expected-fail** (24F ended at 172 / 3868 / 10: +12 files, +116 tests). `pnpm build` passes. The four parts touched disjoint files (checked via `git status` before merging — no file was edited twice). One regression was caught and fixed after the four parts reported done: the masters-index crash above, found by a lead re-walk of the fixed screens before commit — not by any agent's own verify, since it only reproduces when a server component renders the client component directly (the existing unit test uses a different render path and stayed green throughout). **Not verified:** a real phone/touch device, `next start`, the Hindi locale, form writes on the touched screens (this was a read-only walk).

## What changed for later phases
`DEVELOPMENT_GUIDE.md` now has a Phase 24G section (before Phase 25) with the same rules a later polish pass should follow. No later phase's section required a stamp — 24G touched UI only, no schema, no server-function signatures.

## Pending — the next agent must do this first
1. **Phase 25** (schema gate) is next; nothing here changes its scope.
2. **Decide with Arjun:** F-29–F-33 (all structural, all need a call on whether to build the design's own pattern or keep the working alternative), plus the standing list (F-15, D30, D31, F-26 remainder).
3. Re-measure tap targets after 24G if a further sweep is wanted — the kit defaults moved but no full re-walk metrics pass was run after the last fix.

## Files to attach to the next phase
`DEVELOPMENT_GUIDE.md`, `MIS_UI_SPEC.md`, `DECISIONS.md`, `PHASE_LOG.md`, `phase-reports/phase-24G.md`, `qa/FINDINGS.md`, `qa/UI-GAPS-24G.md`
