# QA findings — bugs found by a QA phase, fixed by nobody yet

_Created 2026-09-15. Written by Phases 14–20. Read by whoever schedules the fix pass._

A QA phase **never fixes application code** (`DEVELOPMENT_GUIDE.md` §6). When it finds a
bug it does three things: writes the failing test, appends a row here, and keeps going.
Fixing is separate, scheduled work.

**Severity.** `HIGH` = money, permissions, or data loss. `MED` = wrong behaviour a user
would notice. `LOW` = cosmetic or copy.

| # | Phase | Severity | Where (`path:line`) | What is wrong | Failing test | Ticket |
|---|---|---|---|---|---|---|
| F-01 | 14 | ~~HIGH~~ **FIXED 14F** | `src/server/mis/payroll.ts:6-7` · `src/app/(mis)/mis/payroll/page.tsx:13` · `src/app/(mis)/mis/print/payslip/[employeeId]/page.tsx:22` · `src/server/mis/navigation.ts:51` | Payroll (basic pay, overtime pay, late penalty, gross pay) is computed and returned behind `attendance.read`, which ADMIN, SUPERVISOR, ATTENDANCE_OPERATOR and SUPER_ATTENDANCE_OPERATOR all hold. All four get the `/mis/payroll` screen, the printable payslip and a menu entry. Only `getMonthWageBill` (the owner-home card) is gated on `wages.read`. `getWageAmount` is deliberately ungated (`wage-type.ts:195`), so nothing inside stops it. D24. | `wage-leak.test.ts` "F-01 …" (4 roles) · `wage-screens.test.tsx` "F-01 …" (8) · `permission-matrix.test.ts` "F-01 …" (4) · `server-gates.test.ts` "calculateMonthlyPayroll is gated on wages.read" · `navigation.test.ts` "only a role that holds wages.read is offered the Payroll link" | MIS-46 |
| F-02 | 14 | ~~HIGH~~ **FIXED 14F** | `src/server/mis/business-rules.ts:208` | `getBusinessRules` (gate `settings.read`, so ADMIN) returns every non-AQL rule — including `DAILY_WAGE_DEFAULT`, `OT_MULTIPLIER`, `LATE_PENALTY_PER_MIN` if those rows exist in the live DB — to the Settings screen, whose props carry the values. Depends on those rows existing (nothing in this repo seeds them; the live DB may). | `wage-leak.test.ts` "F-02 …" · `wage-screens.test.tsx` "F-02 …" | MIS-46 |
| F-03 | 14 | ~~HIGH~~ **FIXED 14F** | `src/server/mis/business-rules.ts:219` | `updateBusinessRule` needs only `settings.write` (ADMIN) and accepts ANY key. An Admin can edit the wage rules (which move every payslip) and the four AQL thresholds, bypassing `aql.read` (D6) and `wages.read`. `updateAqlThreshold` guards its keys; this door does not. Reachable from the browser via `updateRuleAction`. | `wage-leak.test.ts` "F-03 …" (3 wage keys + 1 AQL key) | MIS-46 |
| F-04 | 14 | ~~MED~~ **FIXED 14F** | `src/server/mis/business-rules.ts:179-201` | Editing a wage rule writes `{ ruleKey, ruleValue }` — the old AND new wage — into the audit row. `redact()` matches property NAMES and `ruleValue` is not one. The audit screen does not display payloads, so this is at rest in the table, not on a page. | `wage-leak.test.ts` "F-04 …" · `audit-payloads.test.ts` (registry pins the one site) | MIS-46 |
| F-05 | 14 | LOW | `src/server/mis/audit.ts:9-31` | `redact()` is one level deep and knows seven names. Nested `{ row: { amount } }` and `basicWage`/`otPay`/`grossPay`/`latePenalty` pass through. Latent: every caller is clean today (`audit-payloads.test.ts`), so this is a net with holes, not a live leak. | `wage-leak.test.ts` "F-05 …" (2) | MIS-46 |
| F-06 | 14 | **MED** | `src/server/mis/bom.ts:5` · `src/server/mis/reports.ts:98` | Material rates and stock prices are hidden by the screens (`isOwner &&`) but still sent: `getBom` returns every material's `ratePerUnit` to any `orders.read` role (ADMIN, SUPERVISOR, QC); `getStoreReport` returns `pricePerUnit` (and the raw transactions) to ADMIN, SUPERVISOR, QC, SUPER_ATTENDANCE_OPERATOR. PO rates (`MisPoItem.ratePerUnit`) and `MisItem.pricePerUnit` on the item screens were **not** checked — see the report. Policy is D24 (assumed). | `wage-leak.test.ts` "F-06 …" (`getStoreReport` ×4, `getBom` ×3) | MIS-46 |
| F-07 | 14 | LOW | `src/app/(mis)/mis/print/payslip/[employeeId]/page.tsx:22` | The payslip print page's only own check is `requireMisAccess` (the feature flag). Its role gate is whatever `calculateMonthlyPayroll` happens to demand — so F-01 opened it, and a future re-gating elsewhere changes who can print a payslip. It also opens any employee by id (F-11). | covered by the F-01 payslip cases | MIS-46 |
| F-08 | 14 | ~~HIGH~~ **FIXED 14F** | `src/server/mis/payroll.ts:9-19` · `src/server/mis/wage-type.ts:195` · `src/server/mis/business-rules.ts:229` | MIS-272 fails. Payroll is recomputed on demand and reads the wage rate, OT multiplier and late-penalty rate **as of now**, not as of the month being computed. Adding a rate effective today changes last month's payslip. The store is append-only and supports history; the readers do not use it. | `rule-history.test.ts` "F-08 …" (3) | MIS-272 |
| F-09 | 14 | MED | `src/server/mis/business-rules.ts:179` · `wage-type.ts:130` · prisma `@@unique([ruleKey, effectiveFrom])` | `effectiveFrom` is a `@db.Date` and part of the unique key, so a second edit of the same rule (or rate) on the same day collides — including the very first AQL edit, because the AQL defaults are created "today" when the screen is first opened. Proven against a fake that mirrors the constraint; **not run against Postgres**. | `rule-history.test.ts` "F-09 …" (3) | MIS-272 |
| F-10 | 14 | ~~HIGH~~ **FIXED 14F** | `src/server/mis/employee.ts:62,76` | Privilege escalation. `createEmployee` / `updateEmployee` take a `role` and need only `employees.write` (ADMIN). An Admin can set any row — their own included — to OWNER; `roles.ts` then resolves that login as Owner, granting `wages.read`, `aql.read`, `users.invite`. `assignableRoles('ADMIN')` omits OWNER but only the picker uses it. D25. | `employee-slice.test.ts` "F-10 …" (4) | MIS-43 |
| F-11 | 14 | MED | `src/server/mis/employee.ts:57` | D4 is enforced on the list but not on a lookup by id: any `employees.read` holder can open any employee — a Supervisor the other Supervisor's worker, an Admin the Owner. The payslip page is built on this. | `visibility-lists.test.ts` "F-11 …" (2) | MIS-49 |
| F-12 | 14 | LOW | `docs/DECISIONS.md` D19 · Phase 14 prompt | Two documents cited **D6** for the Owner-only wage rule. D6 is the AQL rule; the wage rule had no D-number (BRD S9 only). Fixed in the docs: D19 now cites D24, which records it. | — (documentation) | — |
| F-13 | 14 | MED | `src/server/mis/approvals.ts:4` | One call, one gate (`orders.read`), three kinds of data. QC receives every pending leave request (no `attendance.read`) and QC and SUPERVISOR every pending purchase order (no `po.read`). | `approvals-access.test.ts` "F-13 …" (3) | MIS-49 |

**Phase 14F (2026-09-21) fixed F-01, F-02, F-03, F-08 and F-10 — and F-04, in the same function as F-03.** Each `it.fails` marker was removed and replaced by ordinary passing tests, including one per non-Owner role asserting the SERVER FUNCTION refuses (`phase-reports/phase-14F.md`). The rows below keep their original description as the record of what was wrong. **Still open:** F-05, F-06, F-07 (partly — the page now has its own gate, the by-id lookup is F-11), F-09, F-11, F-13, and the questions section. **Not done:** the guide's "a computed period is immutable once closed" (F-08's second half) — it needs a stored payroll snapshot, recorded in D27 and left for Phase 25.

**How to read the `it.fails` markers.** Every finding above is asserted as the CORRECT behaviour and wrapped in Vitest's `it.fails`: the suite is green while the bug exists and a case turns **red the day the bug is fixed** — that is the cue to delete the `.fails`, and the case becomes a permanent guard. 17 cases remain after 14F (F-05 ×2, F-06 ×7, F-09 ×3, F-11 ×2, F-13 ×3); the 32 for the fixed findings became ordinary tests. Each was also run un-inverted to confirm it fails for the intended reason, not because of a fixture slip; and re-gating `calculateMonthlyPayroll` on `wages.read` in a scratch copy flipped 17 of F-01's 18 cases red (the 18th is the menu entry, a separate fix).

### Found while fixing (14F)

- **Audit rows written before 14F may already hold wage values.** Every `UPDATE_RULE` row for `DAILY_WAGE_DEFAULT`, `OT_MULTIPLIER` or `LATE_PENALTY_PER_MIN` carries the old and new figure in `before`/`after`. The code no longer writes them; the existing rows were not touched or read. Whether to scrub them is a data decision for a person with database access.
- **`updateEmployee` reads a row and then writes it outside a transaction**, so an Admin restating `OWNER` on a row an Owner has just demoted could undo the demotion in that gap. Narrow; not fixed.
- **D25's second half is still open:** an Admin can demote or deactivate the Owner's own record.
- **`effectiveFrom` defaults to the server clock** (`new Date()`) in `addWageRate` and `createRuleRevision`, so "today" is the UTC date, not the factory's (D22). Phase 20 sweep.

### Not bugs — questions for Arjun (no test asserts an answer)

- **Owner lock-out (D25, second half).** An Admin can `deleteEmployee` or re-role the Owner's own record and the Owner then resolves to no role. Nothing stops it; whether it should is unanswered.
- **AQL numbers seen by QC and Admin.** `recordAqlSample` (`qc.ts:97`) returns and audits the thresholds it scored against, so a QC user sees the limits while D6 is about who may *edit* them. D6 does not say whether *seeing* them is Owner-only.
- **Approvals is an Owner surface in the design** (`MIS_UI_SPEC` §4.5 gives the Owner the Approvals tab; D4's evidence says Admin has none) but `getPendingApprovals` serves every `orders.read` role. Only F-13's two kinds are asserted.

### Sites that bucket by server time (Phase 20)

No test in this phase tripped over one — but note that the fake database used by the payroll tests **ignores the date filter**, so `calculateMonthlyPayroll`'s server-local month bounds (`payroll.ts:24-25`, already on the Phase 20 list) are not exercised. Whoever fixes F-08 should test the month boundary at the same time.


<!-- APPEND NEW ROWS DIRECTLY ABOVE THIS LINE. -->

---

_Guide: [`../DEVELOPMENT_GUIDE.md`](../DEVELOPMENT_GUIDE.md) §6_
