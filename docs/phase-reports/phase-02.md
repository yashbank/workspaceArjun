# Phase 2 · Hierarchy-aware pool visibility resolver

**Date:** 2026-09-16   **Model:** opus   **Result:** DONE
**Tickets:** MIS-10, MIS-47, MIS-48

## Inherited work, done first
Phase 1's pending was "human runs vitest + `pnpm build`". Both run **in the agent shell on
this Mac**: 386 tests / 57 files pass, build is 86/86 routes. §2's constraint table said
neither could run — corrected and stamped, because Phases 14–20 were written around it.

## What was built
- `src/server/mis/visibility.ts` (+ `.test.ts`, 13 tests) — the resolver implementing **D4**.
  `resolveVisibleEmployeeIds` returns `string[] | null`, where **`null` = unscoped and `[]` =
  sees nobody**; collapsing the two renders an Owner's list empty or an empty pool as the
  whole factory, so the distinction is load-bearing. Siblings return composable Prisma
  fragments. Descent is breadth-first — **one query per level, never one per person** — with a
  depth cap so a `managerId` cycle cannot hang a request. Resolved once per request via
  `cache()` on primitives.
- `employee.ts:listEmployees` composes the fragment (`visibility.ts:1`, `employee.ts:17`).
- `employee.ts:listEmployeeRoster` — **new, explicitly unscoped**, for the gate kiosk.
- `employee-screen.tsx` — three empty states: no match / nobody reports to you / empty roll.
  The screen is *told* whether it was scoped (`isPoolScoped`); it never computes the rule and
  never receives a row it may not see. Removed a stray `as any` in the employees page.

## Decisions cited
**D4** — implemented; cited, never restated in code (the rule appears only as "D4" +
a pointer). D4's open question (one worker, two pools) is a change to one function.
**D5 — new, and I did not guess it.** Added to `DECISIONS.md` with status OPEN.

## The finding that matters most
**`manager_id` is written by nothing** — not `createEmployee`/`updateEmployee`, not a seed,
not any screen. D4's tree has no data, so a literal scope would have emptied the People list,
the leave and production pickers and the kiosk roster for every non-Owner, today. So the
resolver **narrows nothing until at least one manager link exists**, then D4 applies
everywhere with no further code change. Sharp edge, deliberately flagged: a *partially*
entered org chart scopes everyone who was missed down to themselves.

## What changed for later phases
- **Phase 3** — stamped: must add manager assignment (+ no self-descendant cycles) or this
  resolver is dead code. It is the only place that can.
- **Phase 8** — stamped: the crew may be empty; compose the resolver, don't re-implement it;
  machine/order scope is D5, not decided.
- **Phase 14** — stamped: MIS-49 must seed manager links or it asserts nothing; assert
  `null` vs `[]`.
- **§2 constraints table** — stamped: vitest and `next build` both run on the Mac.

## Pending — the next agent must do this first
Nothing blocking. Phase 3 inherits the manager-assignment stamp above; send Arjun the **D5**
question in `DECISIONS.md` alongside D1–D4.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-02.md
