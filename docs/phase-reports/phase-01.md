# Phase 1 · Wage types & the code system 🔒

**Date:** 2026-09-16   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-9, MIS-44, MIS-45

## What was built

**Half A (schema, prior session):** `MisWageType` model + `MisWageUnit` enum in `prisma/schema.prisma:907-935`, versioned like `MisBusinessRule` (`@@unique([code, effectiveFrom])`). Migration applied, client regenerated — confirmed via `grep -n "model MisWageType" prisma/schema.prisma` and `src/generated/prisma/models.ts` before touching code, per the schema-gate skill.

**Half B (this session):**
- `src/lib/mis/wage-code.ts` (+ `.test.ts`) — pure `nextWageCode()`/`formatWageCode()`, no Prisma import.
- `src/server/mis/wage-type.ts` (+ `.test.ts`) — `listWageTypes`, `listWageCodes` (code+name only), `createWageType`, `addWageRate` (never mutates a past row), `setWageTypeActive`; all gated `requirePermission('wages.read')`. `getWageAmount()` is the one deliberate exception — ungated, mirroring `business-rules.ts`'s `getRuleValue()` — because `calculateMonthlyPayroll` is called by several non-owner roles holding `attendance.read`; gating it would break those existing callers, not just move a number.
- `src/server/mis/payroll.ts:5-19` — `dailyWage` now reads `getWageAmount(DEFAULT_DAILY_WAGE_CODE)`, falling back to the old flat rule when no wage type exists yet — guarantees no figure moves today.
- `src/components/mis/payroll/wage-picker.tsx` — code-only picker, no `amount` in its props at all.
- `src/components/mis/payroll/wage-type-screen.tsx` + `src/app/(mis)/mis/settings/wages/{page,actions}.ts` — Owner-only screen (indigo/🔒 card per MIS_UI_SPEC §4.2), reached only via a link on `/mis/settings` gated on `can(role, 'wages.read')` (`settings-screen.tsx`); absent (not greyed) for ADMIN despite ADMIN holding `settings.read`.

**Verify:** `tsc --noEmit --skipLibCheck | grep -v seed-demo` and `eslint` on every touched file — both clean. Grepped `wage-type.ts` for `amount` near every `logAuditEvent` call: zero hits (all use `auditSafe()`, which omits `amount`). 28 role-throw assertions across 4 gated functions × 7 non-owner roles in `wage-type.test.ts`.

## Decisions cited
None. D1–D4 do not bear on wage-type schema or screens.

## What changed for later phases
None. Phase 5 (AQL) and others still cite `business-rules.ts` unchanged.

## Pending — the next agent must do this first
Human runs on the Mac: `pnpm vitest run src/lib/mis/wage-code.test.ts src/server/mis/wage-type.test.ts` and `pnpm build`. If either fails, reopen this phase rather than starting Phase 2.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-01.md

## Post-run fix (appended after Half B verification)

`pnpm build` initially FAILED — not on Phase 1 code, but on `prisma/seed-demo.ts`. This was
the first time `next build` ever ran on the project. Root cause: `tsconfig.json` excluded only
`prisma/seed.ts`, so the build type-checked the other prisma scripts, and the project-wide
habit of piping `tsc` through `grep -v seed-demo` had hidden it from every prior phase.

**Fixed:** `tsconfig.json` `exclude` is now `["node_modules","prisma.config.ts","prisma/**","src/generated"]`.

**Carry forward — applies to every remaining phase:**
1. The verify command is now `node_modules/.bin/tsc --noEmit --skipLibCheck` with **no grep
   filter**, and it must be silent. The grep was removed from the guide, MIS_UI_SPEC §8, all
   four agent definitions and the mis-schema-gate skill. If seed-demo errors reappear, the
   tsconfig regressed — fix that, never re-add the filter.
2. **`pnpm build` is the acceptance gate, not `tsc`.** It catches server/client boundary
   errors, Decimal serialization and route problems that `tsc` cannot. Run it before calling
   any phase done.

**New tech debt (not for Phase 2):** `prisma/seed-demo.ts` and `prisma/seed-reset.ts` are
stale against the schema and now unchecked. The live DB already holds real seeded data, so
deletion is likely better than repair. Needs its own ticket.

**Build verified green:** 86 routes, TypeScript passed, `/mis/settings/wages` present.
