# Go-live QA report (read-only sweep, localhost:3000, branch golive-qa)

Date 2026-11-13. Dev server restarted with 40 ids in MIS_ENABLED_ACCOUNTS (the first run returned 404 everywhere because of that allow-list; now fixed).
Specs: `e2e/golive/role-sweep.spec.ts` (all roles, ~30 desktop pages + phone 390 + tablet 820 home/attendance), `e2e/golive/deep.spec.ts` (demo order QC/production, attendance month, payroll, audit for OWNER/ADMIN/SUPER_ATTENDANCE_OPERATOR).
Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test -c e2e/golive/playwright.config.ts` (plain `npx playwright test e2e/golive` uses the root config that also runs auth.setup).
Raw data: `e2e/golive/results/*.json`; screenshots `e2e/golive/screenshots/<ROLE>-*.png` (uncommitted).
Logins: OWNER = e2e-owner (.env.e2e); ADMIN = Girdharilal Dhard; SUPERVISOR = Kali charan; QC = CHV.Satyanarayana; STORE_GUY = Kanthi Mallesh; SUPER_ATTENDANCE_OPERATOR = K.Kalyani; ATTENDANCE_OPERATOR = e2e account from .env.e2e. All 7 log in.
Console criteria: errors from page.on console/pageerror/requestfailed/http>=400. Expected permission denials (MisForbiddenError rendered as "You do not have access") on URLs the role does not own are not counted as failures of that role.
Not done: wage arithmetic against the default daily rate (rate for WG-DAILY-01 not located in code quickly; only plausibility checked); Hindi locale; checking every paginated list page.

## Summary
| Role | login | brand+nav | home (no errors, no hscroll 390) | role data | money rule |
|---|---|---|---|---|---|
| OWNER | PASS | PASS (Factory icon yes) | PASS | PASS (2 data bugs, see 3, 5) | PASS (money shown) |
| ADMIN | PASS | PASS (Factory yes) | PASS | PASS | PASS (no wage/money leak) |
| SUPERVISOR | PASS | PASS (Factory yes) | PASS | PASS | PASS |
| QC | PASS | PASS (Factory yes) | PASS | PASS | PASS |
| STORE_GUY | PASS | PASS (Factory no, no production.read) | PASS | PASS | PASS |
| SUPER_ATTENDANCE_OPERATOR | PASS | PASS (Factory no) | PASS | PASS | PASS |
| ATTENDANCE_OPERATOR | PASS | PASS (Factory no) | PASS | PASS (attendance via home; same register) | PASS |

Brand mark `data-testid=brand-mark` visible exactly once at desktop, tablet and phone for every role. Sidebar links match navigation.ts permissions (owner 29 links incl. Payroll; admin 26, no Payroll link; supervisor/QC/store/attendance sets are subsets with no Payroll/Audit/wage links). Home `/mis` returns 200 with zero console/http errors for all roles at all 3 widths; no horizontal scroll on any home.

## Per-role detail
### OWNER
- /mis home (PASS): "WAGE BILL · NOVEMBER, VISIBLE TO YOU ONLY, ₹27,313, 10 people on the register, Overtime ₹313". /mis/dashboard also shows "Wages accrued ₹27,313, 43% of November elapsed, OT ₹313". Money widgets appear only for OWNER (checked below).
- /mis/orders (PASS): 3 demo orders: ORD-202611-90001 DELIVERED, -90002 IN PRODUCTION, -90003 CANCELLED (the "rejected" one shows as CANCELLED).
- /mis/bom (PASS): BOM-202611-90002 approved, 4 stages / 3 materials, est ₹50,300; 90003 has a draft BOM (1 item).
- /mis/po, /mis/grn, /mis/supplier-invoices (PASS): DEMO-PO-001 COMPLETE, DEMO-PO-002 PARTIAL; DEMO-GRN-001/002 CONFIRMED; DEMO-INV-001 Matched ₹77,000, DEMO-INV-002 Pending review ₹51,000, both with ₹0 difference.
- /mis/production/<90002>: 4 logs, 5,900 produced, 300 waste (4.8%), machines [DEMO] Flexo Printer 4-colour and Laminator and Die Cutter, operators Rajeev Kumar / Kanu Charan Mohapatra. /mis/production/<90001>: 8 logs, 20,530 produced, 560 waste. PASS.
- /mis/qc per order (PASS): 90001 DELIVERED 4 checks (3 pass, 1 fail DEF-DIM); 90002 IN_PRODUCTION 3 checks (2 pass, 1 fail DEF-PRINT unresolved); 90003 CANCELLED 1 check (FAIL DEF-DIM). Total 8 = matches seed.
- /mis/attendance?view=monthly&month=2026-11 (PASS): 5 demo employees (EMP110, 115, 118, 131, 133) each 6 present, 0 absent; late 35 min on four; EMP131 OT 150 min, late 0 (cross-midnight night shift plausible).
- /mis/payroll (PASS): "10 employees - November 2026", period Open, 32 attendance rows, "28 unapproved" clock-outs flagged, wage ledger/bank-file buttons (Owner only), the 10 employees listed without bank details. Payroll export text says "No rates and no amounts" for the CSV. 
- Arithmetic: ₹27,313 total includes ₹313 OT; 10 employees on the register (the 5 demo plus 5 older ones). Not re-derived from the default daily rate (see Not done).

### ADMIN (wage-leak focus)
- No "₹", "wage", "salary" amounts anywhere across 32 pages incl. /mis, /mis/dashboard (no Wage widget), /mis/payroll, /mis/audit, /mis/employees, BOM, supplier-invoices. The only text hit is a settings description sentence ("settings govern attendance, salary and QC calculations"), not an amount. PASS.
- Orders/BOM/PO/GRN/invoices/production/QC show the same DEMO rows as OWNER. BOM and supplier-invoices show no ₹ cost columns for ADMIN (Est. Cost and Expected/Invoice/Difference columns hidden): PASS.
- /mis/payroll = attendance-readiness only: employee, Present, Half-day, Absent, Leave (EMP118 6/0, EMP110 6/1, EMP115 6/0, EMP133 6/1, EMP131 6/0) with note "The Owner runs the export": PASS, no money.
- /mis/audit: 1504 events, entity/action list only, no amounts on page 1.
- Note: ADMIN sees "Payroll" via URL (/mis/payroll) though not in sidebar; it is the readiness view (intended).

### SUPERVISOR
Home: "Production - Shift 1", Line clearance needed ([DEMO] Laminator and Die Cutter / ORD-202611-90002 cannot start), MY MACHINES 39 (38 free, 1 running). Sidebar excludes po, supplier-invoices, payroll, audit (those URLs show access-denied). No ₹/wage text on any page. PASS.
### QC
Home: hourly check grid, next 09:00 check, "no checks recorded today". Orders/production/qc pages open; /mis/attendance, inventory, store, payroll, audit, supplier-invoices denied. No money. PASS.
### STORE_GUY
Home: stock health (3 below reorder, 165 at zero), GRNs awaiting entry, 189 items. PO/GRN/supplier-invoices/inventory/store readable; production/qc/attendance/payroll/audit denied. No ₹ visible on BOM/supplier-invoices/store. PASS.
### SUPER_ATTENDANCE_OPERATOR and ATTENDANCE_OPERATOR
Home: gate kiosk status. Sidebar: dashboard, attendance, employees, kiosk, (reports, queue for SAO only), me. Month view shows the 5 demo employees as above; no payroll/audit/orders (denied). No money. PASS. SAO /mis/employees lists only own record (K.Kalyani). 

## Bugs found
1. MEDIUM, `/mis/dashboard` (OWNER and ADMIN): widgets "Output · yesterday 26,430" and "Wastage · yesterday 860" are actually the whole-month totals (20,530 + 5,900; 560 + 300), while `/mis` home correctly shows yesterday 1,300 / 40. Label or query mismatch. Suspected: dashboard output/wastage widgets in `src/server/mis/dashboard*`/`src/components/mis/desktop/*`.
2. MEDIUM, `/mis/dashboard`: "Output against plan" chart empty ("0..3k, Read the rest off the axis") and "Wastage by phase: No wastage recorded this month" although demo logs record 860 waste in Nov; "Orders in flight" lists old ORD-112..116 (0 of 0) rather than demo ORD-90002. Likely the same scope/period problem.
3. LOW, `/mis/orders/<90001>`: DELIVERED order shows "Delivery 10/11/2026 - 3 days overdue". Overdue badge should be hidden for delivered orders. Suspected: order detail page delivery chip.
4. LOW, `/mis/qc/<90003>`: Cancelled/rejected order shows "Total Checks 1, Fail 1, 120 Defects" style stats correctly but "Defects (failed checks)" figure on 90002 reads 120 for 1 failed check (defect quantity, label says failed checks). Label wording. Also production page for 90003 uses "0 KG" while others use PIECE.
5. LOW, dev console: "Only plain objects can be passed to Client Components from Server Components" on `/mis/production`, `/mis/qc`, `/mis/traceability`, `/mis/documents` for OWNER, SUPERVISOR, QC, STORE_GUY (Date/class instance prop). No user-visible effect; fix to avoid prod noise.
6. LOW, `/mis/reports` has horizontal scroll at desktop 1280 and `/mis/attendance` has horizontal scroll at phone 390 (OWNER, ADMIN, SUPERVISOR, SAO, ATTENDANCE_OPERATOR). Homes are fine.
7. LOW, `/mis/attendance?month=2026-11` (month matrix) for ADMIN rendered empty main text in the deep run (OWNER and SUPER_ATTENDANCE_OPERATOR rendered the matrix). Needs a manual look; may be a permission/empty-state.
8. INFO, forbidden pages return HTTP 200 with an in-page "You do not have access" and log a MisForbiddenError server-side; harmless but noisy.
9. INFO, payroll readiness: "28 unapproved clock-outs" and "211 employees have no pay code set" (all non-demo employees); expected for go-live data, flag to owner. Attendance "today" shows 0/216 because demo punches cover the previous 7 days only.
10. INFO, demo order 90003 is CANCELLED in the UI (brief called it "rejected").
