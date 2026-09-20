# Phase 14 · QA · access, roles and money leaks

**Date:** 2026-09-21   **Model:** sonnet (corrected from haiku)   **Result:** DONE — and it found 5 HIGH bugs, all still open
**Tickets:** MIS-34, MIS-40, MIS-43, MIS-46, MIS-49, MIS-52, MIS-272

## What was built
Tests only; no application code changed. 16 new test files, `lib/mis/permissions.test.ts` extended, shared helpers in `src/server/mis/testing/` (`ast.ts`, `wage-world.ts`, `people-world.ts`).
- **MIS-46 money sweep:** `wage-leak.test.ts` (every wage-bearing function × 7 non-Owner roles, writes too, audit before AND after redaction), `wage-screens.test.tsx` (the props each page sends to the browser), `audit-payloads.test.ts` (every `logAuditEvent` call site, by AST), **D6** `aql.read` inside the same files.
- **Gates:** `server-gates.test.ts` (242 exported async functions — each opens with a gate or is on a reasoned list; every server action (~100) and route reaches a gated function), `permission-matrix.test.ts` (28 functions × 8 roles), full hand-written 8×33 matrix in `permissions.test.ts`.
- **MIS-272** `rule-history.test.ts`; **MIS-34** `roles.test.ts` (resolution + role enum drift across lib, schema, client, SQL); **MIS-40** `home/bottom-nav.test.tsx` (§4.5), `navigation.test.ts`, `preferences.test.ts`, `lang-toggle.test.tsx`, `(mis)/actions.test.ts`; **MIS-43** `employee-slice.test.ts`; **MIS-49** `visibility-lists.test.ts` (real org chart, D4/D5), `approvals-access.test.ts`; **MIS-52** `users-lifecycle.test.ts` (both invite paths, real seat guard).
- `qa/access-walkthrough.md` (7 roles + no-role + language). **Not run by anyone yet.**

## Bugs found (13 rows in `qa/FINDINGS.md`)
HIGH: **F-01** payroll figures behind `attendance.read` (4 non-Owner roles get the screen, the payslip, the menu link); **F-02/F-03** Admin reads and edits wage rules and AQL thresholds through the general settings door; **F-08** MIS-272 fails — last month's payroll moves when a rate changes; **F-10** an Admin can make anyone (self included) OWNER. MED/LOW: F-04 wage in audit `ruleValue`, F-05 shallow `redact()`, F-06 material rates/stock prices sent to non-Owners, F-09 same-day rule edit collides, F-11 D4 not applied to lookup by id, F-13 approvals list crosses permissions.
Each is asserted as the correct behaviour under `it.fails` (49 cases): green now, **red the day it is fixed** — delete the `.fails` then.

## Decisions
Cited D4–D6, D15, D18, D21, D22. New: **D24** (money is Owner-only and not merely hidden; wages were BRD S9 with no D-number) and **D25** (only an Owner grants Owner). **The prompt's "wages (D6)" was wrong — D6 is AQL;** D19's rationale had the same mis-cite and is corrected.

## Verification, honestly
`tsc` silent; `pnpm vitest run` 107 files, 2031 passed + 49 expected-fail; `pnpm build` passes; eslint clean on all new files. **Would it go red?** About two dozen mutations run against a scratch copy of the app (real code untouched) — ADMIN widened to `wages.read`/`aql.read`, `listWageTypes`/`deleteEmployee` ungated, `amount` in an audit payload, pool scope dropped, a tab added to STORE_GUY, seat limit off by one, a role added to lib only — each turned named cases red. Fixing F-01 flipped 17 of its 18 markers. Every `it.fails` was also run un-inverted to confirm it fails on the intended assertion.
**Not verified:** PO rates and item-price screens; reports and home pages rendered per role (structural checks only); anything on real Postgres (F-09 uses a fake mirroring the unique key) or a real browser; whether `DAILY_WAGE_DEFAULT` rows exist live (F-02 depends on it); `assignWorkers` by id against the pool. The payroll fake ignores the date filter, so the server-local month bounds (Phase 20 list) were not exercised.

## Pending — the next agent must do this first
Nothing inherited was code for this phase. Open from Phase 13 (human): confirm IST with Arjun (D22), airplane-mode a real tablet; Phase 20 timezone sweep; Phase 23 overrides. **New:** a fix pass for F-01, F-02, F-03, F-08, F-10 before UAT; put D24 and D25 and the three open questions in `FINDINGS.md` to Arjun; a person runs `qa/access-walkthrough.md`.

## Files to attach to the next phase
`DEVELOPMENT_GUIDE.md`, `MIS_UI_SPEC.md`, `DECISIONS.md`, `PHASE_LOG.md`, `phase-reports/phase-14.md`, `qa/FINDINGS.md`
