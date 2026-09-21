# Phase 24F — browser walkthrough (2026-09-22)

Branch `phase-a`. Everything in 24A–E had only been checked by unit tests; this is the first time the screens were opened in a browser.

## How it was done
- **Real app, real database.** `pnpm dev` (Next 16 / Turbopack) against the connected Supabase project. No mocks.
- **One login per role.** Eight temporary users (`wt24f-<role>@example.com`, employee codes `WT24F-*`) were created with the service key, one for each of OWNER, ADMIN, SUPERVISOR, QC, ATTENDANCE_OPERATOR, SUPER_ATTENDANCE_OPERATOR, WORKER, STORE_GUY. They were added to `MIS_ENABLED_ACCOUNTS` for the dev server's process only (`.env.local` was not touched).
- **Two widths.** Headless Chrome 153 driven over the DevTools protocol (no new dependency): 390×844 with a phone user-agent and 1440×900 as a desktop. Each role signed in through the real `/login` form in an isolated browser context, then every route under `/mis` was loaded at both widths (65 routes; dynamic routes use real ids read from the database — an order, a GRN, a PO, an item, a machine, a customer, a supplier, an employee).
- **Recorded per load:** the first `<h1>`, whether the page said "Something went wrong", "You do not have access" or 404, the console errors and uncaught exceptions, page overflow (`scrollWidth − innerWidth`), scroll boxes wider than their content, tap targets under 40px, and a screenshot for anything wrong (and for a fixed list of key screens).
- **Two rounds.** Round 1 is the code as it was. Round 2 is after the fixes below, all 8 roles again at both widths.

## Reading the tables
`✓` opens and is clean · `n/a` the page said "You do not have access" (correct where the role lacks the permission — the nav check below is what shows a wrong one) · `404` not found · `✗C` crashed ("Something went wrong" or HTTP 500) · `⚠` opens but wrote errors to the console · `⚠W` opens but is wider than the window. Roles: Own = Owner, Adm = Admin, Sup = Supervisor, QC, AtO = Attendance Operator, SAO = Super Attendance Operator, Wrk = Worker, Sto = Store Manager.

## Round 1 — before any fix
| Route | Own 390 | Own 1440 | Adm 390 | Adm 1440 | Sup 390 | Sup 1440 | QC 390 | QC 1440 | AtO 390 | AtO 1440 | SAO 390 | SAO 1440 | Wrk 390 | Wrk 1440 | Sto 390 | Sto 1440 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/mis` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗C | ✗C |
| `/mis/approvals` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/attendance` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/attendance/leave` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/attendance/shifts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/audit` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/bom` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/bom/[id]` | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/crew` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/customers` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/customers/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/documents` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/employees` | ✓ | ⚠W | ✓ | ⚠W | ✓ | ⚠W | n/a | n/a | ✓ | ⚠W | ✓ | ⚠W | n/a | n/a | n/a | n/a |
| `/mis/employees/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/grn` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/grn/[id]` | ✗C | ✗C | ✗C | ✗C | ✗C | ✗C | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✗C |
| `/mis/inventory` | ✗C | ✗C | ✗C | ✗C | ✓ | ✗C | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✗C |
| `/mis/inventory/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/kiosk` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/machine-board` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/machine-board/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗C | ✗C |
| `/mis/masters` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/GSM` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/defect-types` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/departments` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/items` | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/machines` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/processes` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/me` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mis/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/orders/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/payroll` | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/po` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/po/[id]` | ⚠ | ⚠ | ⚠ | ⚠ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/badge/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/print/coa/[id]` | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/grn/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✓ |
| `/mis/print/job-card/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/payslip/[id]` | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/po/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mis/production` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/production/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/production/sign-off/[id]` | ✗C | ✗C | ✗C | ✗C | ✗C | ✗C | ✗C | ✗C | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/qc` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/qc/[id]` | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 |
| `/mis/qc/defects` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/qc/grid` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/reports` | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | n/a | ✓ | ⚠ | ⚠ | n/a | ✓ | n/a | ✓ |
| `/mis/settings` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/settings/aql` | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/settings/devices` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/settings/rules` | ✓ | ✓ | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 |
| `/mis/settings/users` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/settings/wages` | ✗E | ✗E | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/store` | ✗C | ✗C | ✗C | ✓ | ✗C | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✗C |
| `/mis/store/count` | ✗C | ✗C | ✗C | ✗C | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✗C |
| `/mis/store/dashboard` | ✗C | ✗C | ✗C | ✗C | ✗C | ✗C | n/a | n/a | ✗C | n/a | n/a | n/a | n/a | n/a | ✗C | ✗C |
| `/mis/store/issue` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/ledger/[id]` | ✗C | ✗C | ✗C | ✗C | ✗C | ✗C | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✗C |
| `/mis/store/receive` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✗C | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/stock` | ✗C | ✗C | ✗C | ✗C | ✗C | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✗E |
| `/mis/store/transactions` | ✗C | ✗C | ✗C | ✗C | ✗C | ✗C | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗C | ✗C |
| `/mis/suppliers` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | ✗C | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/suppliers/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/traceability` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

### What was wrong (round 1)
| # | Where | Roles | What the person saw | Cause | Now |
|---|---|---|---|---|---|
| 1 | `/mis/store`, `/store/stock`, `/store/dashboard`, `/store/count`, `/store/transactions`, `/store/ledger/[id]`, `/mis/inventory` | Owner, Admin, Supervisor, Store | "Something went wrong" after 10–12 s. Console: `timeout exceeded when trying to connect` at `getStockBalance` / `getInventorySummary` | Every page that lists the store asked for each item's balance with its own query — 176 on the live data — and the runtime database pool is **one connection wide on purpose** (`createPoolConfig`, `max: 1`). The queries queued behind each other past the 10 s connect timeout. | Fixed → **F-24** |
| 2 | `/mis` (home) | Store Manager | The role's own home crashed with the same timeout (its "stock health" card is `getStoreDashboard`). Store Manager's `/mis/machine-board/[id]` and `/mis/print/grn/[id]` hit the same timeout while the pool was jammed | same | Fixed → F-24 |
| 3 | `/mis/grn/[id]` | Owner, Admin, Supervisor, Store | "Something went wrong": `v.toNumber is not a function` | A Prisma `Decimal` was passed to a Client Component; what arrives is an empty shell | Fixed → F-24 |
| 4 | `/mis/bom/[id]`, `/mis/masters/items`, `/mis/po/[id]`, `/mis/reports` | Owner, Admin, Supervisor, QC (reports also SAO) | Opens, but 14–206 console errors "Only plain objects can be passed to Client Components … Decimal objects are not supported" — quantities can arrive as empty objects | same | Fixed → F-24 |
| 5 | `/mis/grn` | Supervisor | Listed in their menu, page says "You do not have access" | The page also fetched purchase orders (`po.read`) for the "New GRN" form; a Supervisor holds `grn.read` but not `po.read` | Fixed → F-24 |
| 6 | `/mis/production/sign-off/none` (any `[id]` route with a bad id) | all | "Something went wrong" (`invalid input syntax for type uuid`) instead of "not found" | The id went straight to a `@db.Uuid` column | Fixed → **F-25** (payslip page excepted) |
| 7 | `/mis/settings/wages` | Owner | Uncaught hydration error in the browser console | `toLocaleDateString()` with no locale/zone renders one string on the server and another in the browser | Fixed → **F-26** (also the clearance history on `/mis/production`) |
| 8 | `/mis/employees` | Owner, Admin, Supervisor, AtO, SAO | Page 275 px wider than the 1440 window; the Status column cut off | A table cannot shrink below its content; nothing scrolled it | Fixed → F-26 |
| 9 | Search box on 20 list screens (orders, production, QC, employees, customers, suppliers, machines, departments, items, GRN, PO, inventory, attendance, leave, five store screens) | all | Placeholder and text almost invisible on the cream page; 14 px text, ~38 px tall | The design's MasterTable sheet draws a 48 px, 16 px, white field; these used the old class | Fixed → F-26 (plus 12 filter dropdowns/dates on the store and attendance screens) |
| 10 | D10–D13 desktop fields (search, "As of" date) | Owner | Faint grey text and placeholder | No text colour set | Fixed → F-26 |

Not bugs — my mistakes, corrected in the second pass: (a) `/mis/qc/[id]` and `/mis/print/coa/[id]` take an **order** id; the first pass gave them a QC-check id and correctly got 404. (b) `/mis/dashboard` (the D1 page) was left out of the route list because §2A.8 calls it a redirect shim; it is the real D1 dashboard. Both were walked for all roles in an extra pass and open everywhere.

## Round 2 — after the fixes (all 8 roles, both widths)
| Route | Own 390 | Own 1440 | Adm 390 | Adm 1440 | Sup 390 | Sup 1440 | QC 390 | QC 1440 | AtO 390 | AtO 1440 | SAO 390 | SAO 1440 | Wrk 390 | Wrk 1440 | Sto 390 | Sto 1440 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/mis` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mis/approvals` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/attendance` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/attendance/leave` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/attendance/shifts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/audit` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/bom` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/bom/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/crew` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/customers` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/customers/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/documents` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/employees` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/employees/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/grn` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/grn/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/inventory` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/inventory/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/kiosk` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/machine-board` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/machine-board/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mis/masters` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/GSM` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/defect-types` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/departments` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/items` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/machines` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/masters/processes` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/me` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mis/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/orders/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/payroll` | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/po` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/po/[id]` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/badge/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/print/grn/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/print/job-card/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/payslip/[id]` | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/po/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mis/production` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/production/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/production/sign-off/[id]` | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 |
| `/mis/qc` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/qc/defects` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/qc/grid` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/reports` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | n/a | ✓ | n/a | ✓ |
| `/mis/settings` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/settings/aql` | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/settings/devices` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/settings/rules` | ✓ | ✓ | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 |
| `/mis/settings/users` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a |
| `/mis/settings/wages` | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/store` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/count` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/dashboard` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/issue` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/ledger/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/receive` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/stock` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/store/transactions` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a¹ | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/suppliers` | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ |
| `/mis/suppliers/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/traceability` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/dashboard` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mis/qc/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `/mis/print/coa/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

¹ The QC cell at 1440 first recorded `ERR_CONNECTION_REFUSED` — the dev server was restarting after a file edit. Re-walked on its own (QC, both widths): the page says "You do not have access", as it should.

**Result:** no crash, no console error, no wide page on any role at either width. The remaining non-✓ cells are all expected: `/mis/settings/rules` is Owner-only and **absent (404)** for the other seven roles (D12/D30), and `/mis/production/sign-off/[id]` with a made-up id is now a **404** (there are no job phases in the data to give it a real id). **Nav vs page:** every link a role's sidebar shows opens for that role (round 1 had 8 mismatches: seven crashes and the Supervisor's GRN).

## Things still not right, or not checked
- **Tap targets under 44 px.** Counted on Store Stock (295 at 390, 353 at 1440 — the row links and small buttons), GRN list (16, the "View" links), Machines master (33 at 1440). Not fixed; logged in **F-26**.
- **The phone cannot reach Store, Inventory, GRN, PO or Suppliers** for Owner, Admin or Supervisor: their five bottom tabs don't include them and no page links to them (the design's R1–R4 phone homes don't either). The desktop sidebar does. Logged **F-27** — a design decision, not changed here.
- Every "You do not have access" page is drawn by the error boundary after a `MisForbiddenError` is thrown, so each writes 6 console errors. The message is correct; the noise is not. **F-28**.
- The first pass of round 1 recorded a few HTTP 500s for the Attendance Operator at 390 (`/mis/store/dashboard`, `/mis/store/receive`, `/mis/suppliers`) while three walkers shared the single database connection; they did not repeat in round 2. One Store-side `ERR_CONNECTION_REFUSED` in round 2 was the dev server restarting after a file edit.
- **Not covered:** a real phone (this is a 390 px emulation with a phone user-agent and mouse events, not touch), other browsers, the production build (`next start`), form submissions and writes (the walk only loads pages), offline behaviour and the service worker, and the Hindi locale.

## What the walk touched
Read-only. Loading pages inserted **no** rows: no business rule, audit or store transaction was created in the database between the start of the walkthrough and its end (checked by count). The eight temporary users, their profiles and employee rows were **deleted** afterwards (0 left of each; 7 auth users remain, all real).
