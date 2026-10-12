# C6 — Shared helpers (6a) and their wiring (6b)

Branches: `fix/c6a-helpers` (Wave 1, NEW files + one small edit) and `fix/c6b-wiring` (Wave 2, after C1/C2/C4/C5 are merged, to avoid file collisions). Items: #20 #21 #26 #27 #29 #49(part) #50.

## C6a — new helpers only (no screen wiring)
1. `src/lib/mis/action-result.ts` (existing; extend, keep every current behaviour/test): add `mapPrismaError(error, { entity, fields? })` returning a friendly message: Prisma `P2002` -> "<Entity> with <field> '<value>' already exists" (derive field from `error.meta.target`), `P2003` -> "Cannot change this: it is used elsewhere". `asResult`'s catch calls it for Prisma errors only; non-Prisma errors keep today's message. Tests for each branch + a regression test that existing error shapes are unchanged.
2. `src/lib/mis/factory-time.ts`: export `friendlyWhen(date, tz)` = 12-hour factory date-time (wrap `formatFactoryDateTime`; do not alter existing exports). Test with IST and a UTC input around midnight.
3. `src/components/mis/common/page-back.tsx`: `PageBack({ href, label })` — a "← Label" link, 44px tap target, readable slate-600 text, no kit edits. Test render.
4. `src/components/auth/password-input.tsx`: a password input with a show/hide toggle (accessible button, 44px), same props as the current inputs. Test toggle. (Wired only in 6b.)
5. A lint-style test `src/server/mis/no-iso-in-messages.test.ts` that scans `src/server/mis/**/*.ts` (excluding tests) and fails if `toISOString()` appears inside a `new Error(`/`throw` message template (allow-list the two existing offenders until 6b fixes them).

## C6b — wiring (Wave 2)
1. **#21** `src/server/mis/line-clearance.ts` (~24 "expired at ${since.toISOString()}") and `src/server/mis/machines-board.ts` (~214 "already allocated from … to …"): format with `friendlyWhen` and the factory timezone (`getFactoryTimezone()` at the throw site); update the tests that asserted the ISO text; remove the allow-list entries.
2. **#29** Wrap the master-data create/update actions in `asResult` with `mapPrismaError` and switch their client callers to `unwrap`/handle `ok:false` with an inline message (never the error boundary): supplier, customer, department, machine, defect-type, process, item (code and sku), employee (employeeCode), wage-type, master-option, qc-template. One test per action family proving a duplicate code returns a friendly message.
3. **#26** Store dashboard header gets prominent "Issue material" and "Receive goods" link buttons (plus Physical count); `store-item-screen.tsx` links back to the dashboard.
4. **#27** Use `PageBack` on: store issue/receive, `grn/[id]`, `po/[id]`, `customers/[id]`, `suppliers/[id]`, `production/[id]`, `masters/*`, `settings/*` sub-pages, `attendance/{shifts,leave,extra-pay}` (parent = the list/overview page).
5. **#50** `PasswordInput` on `(auth)/login/login-form.tsx`, `(auth)/invite/accept/page.tsx`, `(auth)/reset-password/page.tsx` ONLY (explicitly approved by the owner despite the (auth) invariant; change nothing else in those files).
6. **#20** `machine-timeline-desktop.tsx`: add a client-side machine-name search box to the Day Timeline tab; reproduce the "search by machine not working" report on the machine board / machine screens and fix if real, else report not-reproducible.
7. **#49 (part)** Employees list: add a Department column and show role in the manager dropdown label ("Name (CODE · ROLE)"). Shift selection is deferred (needs a column).
8. (Optional, last, only if time) The shared kit `Select` always renders its own hardcoded "Select a role" placeholder before a caller's option; if you touch it, grep every consumer first (list them in the PR), keep a back-compat default, and add snapshot tests; otherwise just report the finding.

## Do not touch
Business logic outside the listed files; permissions matrix; schema; kit components except item 8.
