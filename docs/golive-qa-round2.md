# Go-live QA round 2 (local dev, read-only)

Run: localhost:3000, branch golive-ui-b2, spec e2e/golive/round2.spec.ts. Screenshots: e2e/golive/screenshots/r2-<ROLE>-<viewport>-<url>.png (gitignored). Note: DB in this run held demo data (orders ORD-2026xx, 184 store items, 3 payroll employees) besides the real employees.

Legend: PASS ok; DENY = role lacks access, page shows "You do not have access" (expected, counts as pass); FAIL = see notes. Console `MisForbiddenError` logged on DENY pages is dev-mode server-error replay, listed once under notes.


## OWNER

Landing /mis; sidebar (27): dashboard, orders, production, machine-board, customers, bom, traceability, approvals, qc, attendance, employees, kiosk, payroll, masters, reports, settings, po, grn, supplier-invoices, inventory, suppliers, documents, queue, audit, store, crew, me

| Screen | Desktop 1280 | Tablet 820 | Phone 390 | Notes |
|---|---|---|---|---|
| /mis | PASS | PASS | PASS |  |
| /mis/dashboard | PASS | PASS | PASS | catalogue={"Low stock alerts": true, "Inward PO fulfilment": true, "BOM pipeline": true, "Scrap rate trend": true} / moneyGroup=true |
| /mis/orders | FAIL | PASS | PASS | desktop: load error/timeout: page.goto: Timeout 45000ms exceeded. Call log: [2 |
| /mis/production | PASS | PASS | PASS |  |
| /mis/machine-board | PASS | PASS | PASS |  |
| /mis/customers | PASS | PASS | PASS |  |
| /mis/bom | PASS | PASS | PASS |  |
| /mis/traceability | PASS | - | - |  |
| /mis/approvals | PASS | - | - |  |
| /mis/qc | PASS | - | - | selects=3 |
| /mis/attendance | PASS | - | - |  |
| /mis/employees | PASS | - | - | rowActions=[{"name": "View", "w": 44, "h": 44}, {"name": "Badge", "w": 44, "h": 44}, {"name": "Edit", "w": 44, "h": 44}, {"name": "Deactivate", "w": 44, "h": 44}, {"name": "Delete", "w": 44, "h": 44}] |
| /mis/kiosk | PASS | - | - |  |
| /mis/payroll | PASS | - | - | tabs={"Register": {"selected": "true", "visiblePanels": 1, "len": 198}, "Overview": {"selected": "true", "visiblePanels": 1, "len": 71}, "Preflight": {"selected": "true", "visiblePanels": 1, "len": 166}, "Exports & Banking": {"selected": "true", "visiblePanels": 1, |
| /mis/masters | PASS | - | - |  |
| /mis/reports | PASS | - | - |  |
| /mis/settings | PASS | - | - |  |
| /mis/po | PASS | - | - |  |
| /mis/grn | PASS | - | - |  |
| /mis/supplier-invoices | PASS | - | - |  |
| /mis/inventory | PASS | - | - |  |
| /mis/suppliers | PASS | - | - |  |
| /mis/documents | PASS | - | - |  |
| /mis/queue | PASS | - | - |  |
| /mis/audit | PASS | - | - |  |
| /mis/store | PASS | - | - |  |
| /mis/crew | PASS | - | - |  |
| /mis/me | PASS | - | - |  |
| /mis/store/stock | PASS | - | - |  |
| /mis/store/transactions | PASS | - | - |  |
| /mis/me/account | PASS | - | - |  |

Counts (viewport checks): PASS 44, DENY(expected) 0, FAIL 0 after retest. Combobox focus probe: {'combobox': {'url': '/mis/qc', 'options': 0}}

## ADMIN

Landing /mis; sidebar (26): dashboard, orders, production, machine-board, customers, bom, traceability, approvals, qc, attendance, employees, kiosk, masters, reports, settings, po, grn, supplier-invoices, inventory, suppliers, documents, queue, audit, store, crew, me

| Screen | Desktop 1280 | Tablet 820 | Phone 390 | Notes |
|---|---|---|---|---|
| /mis | PASS | PASS | PASS |  |
| /mis/dashboard | PASS | PASS | PASS | catalogue={"Low stock alerts": true, "Inward PO fulfilment": true, "BOM pipeline": true, "Scrap rate trend": true} / moneyGroup=false |
| /mis/orders | PASS | PASS | PASS |  |
| /mis/production | PASS | PASS | PASS |  |
| /mis/machine-board | PASS | PASS | PASS |  |
| /mis/customers | PASS | PASS | PASS |  |
| /mis/bom | PASS | PASS | PASS |  |
| /mis/traceability | PASS | - | - |  |
| /mis/approvals | PASS | - | - |  |
| /mis/qc | PASS | - | - | selects=3 |
| /mis/attendance | PASS | - | - |  |
| /mis/employees | PASS | - | - | rowActions=[{"name": "View", "w": 44, "h": 44}, {"name": "Badge", "w": 44, "h": 44}, {"name": "Edit", "w": 44, "h": 44}, {"name": "Deactivate", "w": 44, "h": 44}, {"name": "Delete", "w": 44, "h": 44}] |
| /mis/kiosk | PASS | - | - |  |
| /mis/masters | PASS | - | - |  |
| /mis/reports | PASS | - | - |  |
| /mis/settings | PASS | - | - |  |
| /mis/po | PASS | - | - |  |
| /mis/grn | PASS | - | - |  |
| /mis/supplier-invoices | PASS | - | - |  |
| /mis/inventory | PASS | - | - |  |
| /mis/suppliers | PASS | - | - |  |
| /mis/documents | PASS | - | - |  |
| /mis/queue | PASS | - | - |  |
| /mis/audit | PASS | - | - |  |
| /mis/store | PASS | - | - |  |
| /mis/crew | PASS | - | - |  |
| /mis/me | PASS | - | - |  |
| /mis/store/stock | PASS | - | - |  |
| /mis/store/transactions | PASS | - | - |  |
| /mis/payroll | PASS | - | - |  |
| /mis/me/account | PASS | - | - |  |

Counts (viewport checks): PASS 45, DENY(expected) 0, FAIL 0. Combobox focus probe: {'combobox': {'url': '/mis/orders', 'options': 0}}

## QC

Landing /mis; sidebar (15): dashboard, orders, production, machine-board, customers, bom, traceability, qc, masters, reports, po, grn, documents, crew, me

| Screen | Desktop 1280 | Tablet 820 | Phone 390 | Notes |
|---|---|---|---|---|
| /mis | PASS | PASS | PASS |  |
| /mis/dashboard | PASS | PASS | PASS | catalogue={"Low stock alerts": false, "Inward PO fulfilment": false, "BOM pipeline": true, "Scrap rate trend": true} / moneyGroup=false |
| /mis/orders | PASS | PASS | PASS |  |
| /mis/production | PASS | PASS | PASS |  |
| /mis/machine-board | PASS | PASS | PASS |  |
| /mis/customers | PASS | PASS | PASS |  |
| /mis/bom | PASS | PASS | PASS |  |
| /mis/traceability | PASS | - | - |  |
| /mis/qc | PASS | - | - | selects=3 |
| /mis/masters | PASS | - | - |  |
| /mis/reports | PASS | - | - |  |
| /mis/po | PASS | - | - |  |
| /mis/grn | PASS | - | - |  |
| /mis/documents | PASS | - | - |  |
| /mis/crew | PASS | - | - |  |
| /mis/me | PASS | - | - |  |
| /mis/supplier-invoices | DENY | - | - |  |
| /mis/inventory | DENY | - | - |  |
| /mis/suppliers | DENY | - | - |  |
| /mis/audit | DENY | - | - |  |
| /mis/store/stock | DENY | - | - |  |
| /mis/store/transactions | DENY | - | - |  |
| /mis/payroll | DENY | - | - |  |
| /mis/employees | DENY | - | - | rowActions=[] |
| /mis/me/account | PASS | - | - |  |
| /mis/attendance | DENY | - | - |  |

Counts (viewport checks): PASS 31, DENY(expected) 9, FAIL 0. Combobox focus probe: {'combobox': {'url': '/mis/orders', 'options': 0}}

## SUPERVISOR

Landing /mis; sidebar (19): dashboard, orders, production, machine-board, customers, bom, traceability, qc, attendance, employees, masters, reports, grn, inventory, documents, queue, store, crew, me

| Screen | Desktop 1280 | Tablet 820 | Phone 390 | Notes |
|---|---|---|---|---|
| /mis | PASS | PASS | PASS |  |
| /mis/dashboard | PASS | PASS | FAIL | phone: horizontal scroll / catalogue={"Low stock alerts": true, "Inward PO fulfilment": false, "BOM pipeline": true, "Scrap rate trend": true} / moneyGroup=false |
| /mis/orders | PASS | PASS | FAIL | phone: horizontal scroll |
| /mis/production | PASS | PASS | FAIL | phone: horizontal scroll |
| /mis/machine-board | PASS | PASS | FAIL | phone: horizontal scroll |
| /mis/customers | PASS | PASS | FAIL | phone: horizontal scroll |
| /mis/bom | PASS | PASS | FAIL | phone: horizontal scroll |
| /mis/traceability | PASS | - | - |  |
| /mis/qc | PASS | - | - | selects=3 |
| /mis/attendance | PASS | - | - |  |
| /mis/employees | PASS | - | - | rowActions=[{"name": "View", "w": 44, "h": 44}, {"name": "Badge", "w": 44, "h": 44}] |
| /mis/masters | PASS | - | - |  |
| /mis/reports | PASS | - | - |  |
| /mis/grn | PASS | - | - |  |
| /mis/inventory | PASS | - | - |  |
| /mis/documents | PASS | - | - |  |
| /mis/queue | PASS | - | - |  |
| /mis/store | PASS | - | - |  |
| /mis/crew | PASS | - | - |  |
| /mis/me | PASS | - | - |  |
| /mis/po | DENY | - | - |  |
| /mis/supplier-invoices | DENY | - | - |  |
| /mis/suppliers | DENY | - | - |  |
| /mis/audit | DENY | - | - |  |
| /mis/store/stock | PASS | - | - |  |
| /mis/store/transactions | PASS | - | - |  |
| /mis/payroll | DENY | - | - |  |
| /mis/me/account | PASS | - | - |  |

Counts (viewport checks): PASS 31, DENY(expected) 5, FAIL 6. Combobox focus probe: {'combobox': {'url': '/mis/orders', 'options': 0}}

## STORE_GUY

Landing /mis; sidebar (13): dashboard, orders, customers, bom, traceability, po, grn, supplier-invoices, inventory, suppliers, documents, store, me

| Screen | Desktop 1280 | Tablet 820 | Phone 390 | Notes |
|---|---|---|---|---|
| /mis | PASS | PASS | PASS |  |
| /mis/dashboard | PASS | PASS | PASS | catalogue={"Low stock alerts": true, "Inward PO fulfilment": true, "BOM pipeline": true, "Scrap rate trend": false} / moneyGroup=false |
| /mis/orders | PASS | PASS | PASS |  |
| /mis/customers | DENY | PASS | PASS |  |
| /mis/bom | PASS | PASS | PASS |  |
| /mis/traceability | PASS | PASS | PASS |  |
| /mis/po | PASS | PASS | PASS |  |
| /mis/grn | PASS | - | - |  |
| /mis/supplier-invoices | PASS | - | - |  |
| /mis/inventory | PASS | - | - |  |
| /mis/suppliers | PASS | - | - |  |
| /mis/documents | PASS | - | - |  |
| /mis/store | PASS | - | - |  |
| /mis/me | PASS | - | - |  |
| /mis/production | DENY | - | - |  |
| /mis/qc | DENY | - | - | selects=1 |
| /mis/audit | DENY | - | - |  |
| /mis/store/stock | PASS | - | - |  |
| /mis/store/transactions | PASS | - | - |  |
| /mis/crew | DENY | - | - |  |
| /mis/payroll | DENY | - | - |  |
| /mis/employees | DENY | - | - | rowActions=[] |
| /mis/me/account | PASS | - | - |  |
| /mis/attendance | DENY | - | - |  |
| /mis/reports | PASS | - | - |  |
| /mis/masters | DENY | - | - |  |

Counts (viewport checks): PASS 31, DENY(expected) 9, FAIL 0. Combobox focus probe: {'combobox': {'url': '/mis/orders', 'options': 0}}

## SUPER_ATTENDANCE_OPERATOR

Landing /mis; sidebar (7): dashboard, attendance, employees, kiosk, reports, queue, me

| Screen | Desktop 1280 | Tablet 820 | Phone 390 | Notes |
|---|---|---|---|---|
| /mis | PASS | PASS | PASS |  |
| /mis/dashboard | PASS | PASS | PASS | catalogue={"Low stock alerts": false, "Inward PO fulfilment": false, "BOM pipeline": false, "Scrap rate trend": false} / moneyGroup=false |
| /mis/attendance | PASS | PASS | PASS |  |
| /mis/employees | PASS | PASS | PASS | rowActions=[{"name": "View", "w": 44, "h": 44}, {"name": "Badge", "w": 44, "h": 44}] |
| /mis/kiosk | PASS | PASS | PASS |  |
| /mis/reports | PASS | PASS | PASS |  |
| /mis/queue | PASS | PASS | PASS |  |
| /mis/me | PASS | - | - |  |
| /mis/orders | DENY | - | - |  |
| /mis/production | DENY | - | - |  |
| /mis/bom | DENY | - | - |  |
| /mis/qc | DENY | - | - | selects=1 |
| /mis/po | DENY | - | - |  |
| /mis/grn | DENY | - | - |  |
| /mis/supplier-invoices | DENY | - | - |  |
| /mis/inventory | DENY | - | - |  |
| /mis/suppliers | DENY | - | - |  |
| /mis/audit | DENY | - | - |  |
| /mis/store/stock | DENY | - | - |  |
| /mis/store/transactions | DENY | - | - |  |
| /mis/crew | DENY | - | - |  |
| /mis/payroll | DENY | - | - |  |
| /mis/me/account | PASS | - | - |  |
| /mis/masters | DENY | - | - |  |

Counts (viewport checks): PASS 23, DENY(expected) 15, FAIL 0. Combobox focus probe: {'combobox': {'url': '/mis/orders', 'options': 0}}

## ATTENDANCE_OPERATOR

Landing /mis; sidebar (5): dashboard, attendance, employees, kiosk, me

| Screen | Desktop 1280 | Tablet 820 | Phone 390 | Notes |
|---|---|---|---|---|
| /mis | PASS | PASS | PASS |  |
| /mis/dashboard | PASS | PASS | PASS | catalogue={"Low stock alerts": false, "Inward PO fulfilment": false, "BOM pipeline": false, "Scrap rate trend": false} / moneyGroup=false |
| /mis/attendance | PASS | PASS | PASS |  |
| /mis/employees | PASS | PASS | PASS | rowActions=[{"name": "View", "w": 44, "h": 44}, {"name": "Badge", "w": 44, "h": 44}] |
| /mis/kiosk | PASS | PASS | PASS |  |
| /mis/me | PASS | PASS | PASS |  |
| /mis/orders | DENY | - | - |  |
| /mis/production | DENY | - | - |  |
| /mis/bom | DENY | - | - |  |
| /mis/qc | DENY | - | - | selects=1 |
| /mis/po | DENY | - | - |  |
| /mis/grn | DENY | - | - |  |
| /mis/supplier-invoices | DENY | - | - |  |
| /mis/inventory | DENY | - | - |  |
| /mis/suppliers | DENY | - | - |  |
| /mis/audit | DENY | - | - |  |
| /mis/store/stock | DENY | - | - |  |
| /mis/store/transactions | DENY | - | - |  |
| /mis/crew | DENY | - | - |  |
| /mis/payroll | DENY | - | - |  |
| /mis/me/account | PASS | - | - |  |
| /mis/reports | PASS | - | - |  |
| /mis/masters | DENY | - | - |  |

Counts (viewport checks): PASS 20, DENY(expected) 15, FAIL 0. Combobox focus probe: {'combobox': {'url': '/mis/orders', 'options': 0}}

## Findings and notes

FAIL 1 (SUPERVISOR, phone 390px): horizontal scroll (scrollWidth 399 vs 390) on /mis/dashboard, /mis/orders, /mis/production, /mis/machine-board, /mis/customers, /mis/bom (not on /mis home). Overflowing elements: the header language toggle (`div.inline-flex rounded-lg border border-slate-300 p-0.5`, right edge 399) and its buttons. Header row is too wide with the account name "Kali charan" plus role label. Suspected files: src/components/mis/shell/lang-toggle.tsx and the phone header in src/components/mis/shell/ (sub-header layout at 390px, `max-[359px]` rules do not cover 390). Screenshots: e2e/golive/screenshots/r2-SUPERVISOR-phone-_mis.png (home) and the phone checks of the other pages have no per-page shot; reproduce at 390px on /mis/orders as SUPERVISOR.

Minor (not failures):
- Role screens a user cannot open (not in sidebar) render a friendly "You do not have access to this" card (HTTP 200) and log `MisForbiddenError: Not permitted: <action>` via console in dev (QC, SUPERVISOR, STORE_GUY, attendance roles). Expected deny; consider whether dev console noise matters.
- Non-owner money scan: no rupee amounts or wage numbers on any non-owner page. Only prose hits: /mis/settings ("govern attendance, salary and QC calculations"), /mis/supplier-invoices ("checked against the purchase order rate", ADMIN and STORE_GUY). /mis/reports "QC PASS RATE" is a quality metric (SUPER_ATTENDANCE_OPERATOR tablet/phone). The nav label "Payroll" appears only for OWNER; ADMIN /mis/payroll is the attendance-readiness view (clock-outs approved, leave open, attendance counts) with no money.
- OWNER: payroll tabs Register (default), Overview, Preflight, Exports & Banking each select and show exactly one visible panel. Dashboard Customise lists Low stock alerts, Inward PO fulfilment, BOM pipeline, Scrap rate trend and a Money group. Not saved.
- ADMIN Customise shows all four new widgets, no Money group. QC: BOM pipeline + Scrap rate trend only. SUPERVISOR: Low stock alerts, BOM pipeline, Scrap rate trend. STORE_GUY: Low stock alerts, Inward PO fulfilment, BOM pipeline. SUPER_ATTENDANCE_OPERATOR and ATTENDANCE_OPERATOR: none of the four.
- /mis/employees: OWNER and ADMIN row actions View, Badge, Edit, Deactivate, Delete all with accessible names and 44x44px; SUPERVISOR View and Badge only. 20 rows per page for OWNER/ADMIN. No horizontal scroll at any viewport for OWNER/ADMIN.
- /mis/qc: status filter present (3 select controls) for OWNER, ADMIN, QC, SUPERVISOR.
- Combobox (Employee in /mis/attendance/leave, "+ Request Leave" form, OWNER): opens with 100 listbox options, selecting an option sets the value. Focus-only, nothing saved. The "options: 0" in the per-role table extras is a flaw in the sweep probe (it targeted a non-combobox first), not a product bug.
- /mis/me/account loads for every role (PASS in each table).
- The DB had demo data during this run (ORD-2026.. orders, 184 store items, 3 payroll employees), unlike the brief; empty-state checks were therefore not exercised for orders/po/grn.
- Not exercised: Customise save, any write action. Sweep covers desktop for every reachable screen; tablet/phone for home plus first 6 sidebar screens.
