# Phase 14F · Fix the five

**Date:** 2026-09-21   **Model:** sonnet (builder and checkers)   **Result:** DONE — five fixed, plus F-04; F-08's "closed month is final" half deliberately NOT done
**Tickets:** F-10, F-01, F-02, F-03, F-08 (`qa/FINDINGS.md`); MIS-43, MIS-46, MIS-272

## What was fixed (application code)
- **F-10 · D25:** `assertMayAssignRole` in `src/server/mis/employee.ts`. Only an Owner may create or promote to OWNER; a non-role string is refused; a role merely *restated* by the edit form is not a grant (found by the checker).
- **F-01 · D24:** `calculateMonthlyPayroll` and `getWageAmount` now `wages.read`; the payroll page, the payslip page (which had NO role check of its own) and the menu entry too.
- **F-02 / F-03 · D6, D24:** new `lib/mis/rule-keys.ts` classifies the three wage rules. `getBusinessRules` filters them out without `wages.read`; `updateBusinessRule` demands `aql.read` / `wages.read` by KEY. **F-04** (a wage rule's old and new value written into the audit row) closed in the same function.
- **F-08 · D27:** payroll prices each attendance day at the rate in force on that day (`lib/mis/effective-dated.ts`, gated `getWageRateHistory` / `getWageRuleHistory`). Month bounds are now UTC dates — the server-local ones dropped the 31st east of UTC.

## Tests
Each `it.fails` was removed and replaced by ordinary tests; for every finding **all seven non-Owner roles are asserted refused at the server function** (and, where a page exists, the page). New: `payroll-figures.test.ts` (hand-worked figures, every status), `wage-rule-keys.test.ts`, `effective-dated.test.ts`. Two existing tests were **changed, not weakened**: `wage-type.test.ts`'s "getWageAmount — ungated" block pinned the defect and now asserts refusal; `navigation.test.ts` lost `payroll` from four hand-written role lists (the point of F-01). Fixtures moved from Dec 2025 to Jan 2026 because the shared fake DB now honours date ranges.

## Decisions
Cited D4, D6, D22, D24, D25. New **D27** (which rate pays a day; a month is not final). **D26 already existed** (overtime per-hour rate, decided 2026-09-20, not on the board); I first numbered mine D26, the checker caught the collision, mine is D27 and D26 now has its board row.

## Verification, honestly
`tsc` silent; `pnpm vitest run` **110 files, 2204 passed + 17 expected-fail** (was 107 / 2031 + 49 — the 17 are F-05, F-06, F-09, F-11, F-13, not this phase); `pnpm build` passes; eslint clean on every touched file (whole-directory lint shows old errors in files I did not touch). About 27 mutations run in a scratch copy of the app (real code untouched): each gate loosened, each rate read as-of-now, server-local month bounds, resolver off-by-one, HALF_DAY/LEAVE mis-priced, audit writing the value again, a fourth wage rule read from another file — each turned named cases red. One survivor is an equivalent mutation (`null * rate` is 0). **Payroll's gate is defended twice** (function + amount reader + pages), so weakening one door is masked by the others; the static gate tests catch a single weakening, and all four together turn the behavioural tests red. **Checker verdicts:** F-10 PASS, F-01 PASS, F-02/F-03 PASS, F-08 PASS — each with a gap I closed (the read-vs-write race note stays; the classifier scan now covers every server file; HALF_DAY/ABSENT/LEAVE/null minutes now tested).
**Not verified:** a real browser, real Postgres (F-09 still uses a fake of the unique key), the Owner payslip rendering.

## Pending — the next agent must do this first
- **Human:** decide whether to scrub old audit rows — every `UPDATE_RULE` row for a wage rule written before today holds the old/new figure (not read or changed). Put D24, D25, D27 and the FINDINGS questions to Arjun.
- **Not done:** "a computed period is immutable once closed" — needs a payroll snapshot table (schema gate); stamped on Phase 25.
- **Still open:** F-05, F-06, F-09, F-11, F-13; Admin can still demote the Owner's own record (D25 second half); `effectiveFrom` defaults to the server clock (Phase 20).
- Inherited from Phase 13 and still human-only: confirm IST (D22); airplane-mode a real tablet.

## Files to attach to the next phase
`DEVELOPMENT_GUIDE.md`, `MIS_UI_SPEC.md`, `DECISIONS.md`, `PHASE_LOG.md`, `phase-reports/phase-14F.md`, `qa/FINDINGS.md`
