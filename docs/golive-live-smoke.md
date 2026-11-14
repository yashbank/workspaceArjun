# Go-live live smoke (https://workspace-arjun.vercel.app)

Read-only. Spec: e2e/golive/live-smoke.spec.ts (needs E2E_ALLOW_LIVE=1). Results JSON: e2e/golive/results/live-smoke.json.
Page loads: 57 main run + ~12 diagnostic probes = ~69 of 120 budget. No passwords logged.

| Check | OWNER | ADMIN | QC | SUPERVISOR | STORE_GUY | SUPER_ATT_OP | ATT_OP |
|---|---|---|---|---|---|---|---|
| login ok, no 404 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| home desktop | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| brand-mark desktop (aside) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| brand-mark phone (header) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| nav items non-empty | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| no hscroll at 390 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| no console errors / failed reqs | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| role pages (3, desktop) | PASS | PASS (payroll, employees, attendance) | PASS | PASS | PASS | PASS | PASS |
| ADMIN /mis/payroll no currency/wage | - | PASS | - | - | - | - | - |
| ADMIN /mis/employees = 149 EMP101+ | - | INCONCLUSIVE | - | - | - | - | - |
| /mis/me/account loads | - | PASS | - | - | - | - | - |

Role pages: OWNER orders/production/reports; QC qc/production/orders; SUPERVISOR production/attendance/orders; STORE_GUY store/inventory/grn; SUPER_ATT_OP attendance/me/employees; ATT_OP attendance/me/orders.

## Failures / notes

1. ATTENDANCE_OPERATOR (E2E account), https://workspace-arjun.vercel.app/mis/orders: console error "An error occurred in the Server Components render..." plus "[mis] boundary caught Error" (x2 each). Page shows the error boundary shell (nav: Dashboard, Attendance, Employees, Kiosk, Me). /mis/orders is not in this role's nav (my test page choice was off-role), so this is a role-denied route rendering an error boundary instead of a clean redirect/403. Low severity, but worth a graceful denial. /mis/attendance and /mis/me for this role: clean.
2. ADMIN /mis/employees: page loads (Employees heading, Add Employee, table with EMP codes such as EMP189, EMP158, EMP118, EMP-ABDULBAS-0URW) but only 9 distinct EMP codes in DOM after 4s, so the 149 count could not be confirmed from the DOM (list is likely paginated/virtualised or lazily loaded). Needs a count check via the page's total/pagination or DB; not a confirmed defect.
