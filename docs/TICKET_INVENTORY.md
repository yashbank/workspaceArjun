# MIS Ticket Inventory — Build-vs-Jira Cross-Check

_Generated 2026-09-15 against the BPP MIS Jira project (294 issues) and the codebase under `Arjun/app/src/{app/(mis)/mis, components/mis, server/mis}`._

## Summary

**Jira status reality-check:** all 294 issues in the project are still status **"To Do"** in Jira — the board has not been updated to reflect any of the work described below. Every YES/PARTIAL verdict here comes from the codebase, not from Jira status.

**Total issues:** 294 (8 Epics, 71 Stories, 22 Tasks, 193 Subtasks). Table below groups by epic and covers the 286 non-epic issues (the actual units of work); epics themselves get a rollup row.

**Totals by `built?` (non-epic issues, n=286):**
- YES: 140 (48%)
- PARTIAL: 54 (18%)
- NO: 92 (32%)

**Totals by `layer` (non-epic issues):**
- BE: 105
- FE: 74
- QA: 58
- FULLSTACK: 39
- DATA: 4
- DEVOPS: 3
- DOC: 3

**Layer split of the genuinely NOT built (`built?`=NO) issues, n=92:**
- QA: 54
- BE: 23
- FE: 11
- FULLSTACK: 3
- DATA: 1

**Epics carrying the most remaining work** (ranked by NO count, PARTIAL half-weighted):
- E7 · Quality, COA, Documents & Reports (`MIS-171`) — 14 NO, 17 PARTIAL, score 22.5
- E6 · Production & Wastage — the BPR spine (`MIS-135`) — 18 NO, 8 PARTIAL, score 22.0
- E1 · Foundation & Access Control (`MIS-1`) — 16 NO, 0 PARTIAL, score 16.0
- E5 · Orders, BOM & Job Cards (`MIS-99`) — 9 NO, 12 PARTIAL, score 15.0
- E3 · Attendance & Workforce — including the Android kiosk (`MIS-220`) — 12 NO, 3 PARTIAL, score 13.5
- E8 · Platform, Non-functional & Deploy (`MIS-3`) — 9 NO, 3 PARTIAL, score 10.5

**Where Jira and the codebase clearly disagree:**
- Every one of the 294 issues, including ones whose feature is fully shipped (e.g. E1-05 Employee Master, E9 store receive/issue cart, item Excel import), still shows Jira status "To Do" — the board was never updated as work landed.
- MIS-273 through MIS-294 (22 issues, the whole "Task" issue type) sit completely outside the Epic→Story→Subtask hierarchy: none has a `parent` link. MIS-274–279 duplicate the E9 Purchase Orders/GRN/Store scope as flat tasks; MIS-280–294 duplicate it a second time as an unrelated flat list (master data + store screens + reports) with no epic link at all — yet the underlying features (item master, Excel import, store receive/issue cart, stock list) are already built. This block is the largest single hierarchy/tracking gap in the project.
- Conversely, several tickets read as done-sounding but have no code: E1-06 (wage types), E1-07 (pool visibility resolver), E1-08 (MIS user management/invites), E2-08 (defect type master + AQL severity), E4-02/E4-03 (worker allocation engine), E7-04 (AQL calculation) — all still "To Do" in Jira, and correctly so; no trace of them exists in schema or server code.

---

## E1 · Foundation & Access Control (`MIS-1`)

**37 issues** — YES 21 · PARTIAL 0 · NO 16 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-4 | MIS-1 | E1-01 · Scaffold the MIS module behind a feature flag | To Do | FULLSTACK | YES | flags.ts + MIS_ENABLED_ACCOUNTS + (mis) route group |
| MIS-5 | MIS-1 | E1-02 · MIS role model, without touching the existing Role… | To Do | BE | YES | MisRole enum, roles.ts |
| MIS-6 | MIS-1 | E1-03 · Permission gate and audit wrapper | To Do | FULLSTACK | YES | guard.ts/auth.ts/audit.ts, guard.test.ts |
| MIS-7 | MIS-1 | E1-04 · MIS shell — role-based navigation and language togg… | To Do | FE | YES | mis-shell.tsx, bottom-nav, lang-toggle, locale-provider |
| MIS-8 | MIS-1 | E1-05 · ⭐ REFERENCE SLICE — Employee Master end to end | To Do | FULLSTACK | YES | employee.ts, employee-screen/profile-screen |
| MIS-9 | MIS-1 | E1-06 · Wage types and the code system — Owner-only finance | To Do | BE | NO | no MisWageType model; payroll uses one flat DAILY_WAGE_DEFAULT rule |
| MIS-10 | MIS-1 | E1-07 · Hierarchy-aware pool visibility resolver | To Do | BE | NO | no hierarchy/pool visibility resolver found beyond managerId self-relation |
| MIS-11 | MIS-1 | E1-08 · MIS user management and invites | To Do | FULLSTACK | NO | no MIS-specific user mgmt/invite screen or server code found |
| MIS-29 | MIS-1 | E1-01 · BE · Feature flag helper and route-group guard | To Do | BE | YES | flags.ts + MIS_ENABLED_ACCOUNTS + (mis) route group |
| MIS-30 | MIS-1 | E1-01 · FE · /mis route group, layout and placeholder home | To Do | FE | YES | flags.ts + MIS_ENABLED_ACCOUNTS + (mis) route group |
| MIS-31 | MIS-1 | E1-01 · QA · Flag on/off tests and existing-suite regression | To Do | QA | YES | flags.ts + MIS_ENABLED_ACCOUNTS + (mis) route group; covered by tests |
| MIS-32 | MIS-1 | E1-02 · BE · MisRole enum, MisEmployeeRole model and migrat… | To Do | BE | YES | MisRole enum, roles.ts |
| MIS-33 | MIS-1 | E1-02 · FE · Role badges and role picker component | To Do | FE | YES | MisRole enum, roles.ts |
| MIS-34 | MIS-1 | E1-02 · QA · Migration safety and role-resolution tests | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-35 | MIS-1 | E1-03 · BE · requirePermission() and logAuditEvent() implem… | To Do | BE | YES | guard.ts/auth.ts/audit.ts, guard.test.ts |
| MIS-36 | MIS-1 | E1-03 · FE · 403 page and permission-aware rendering helpers | To Do | FE | YES | guard.ts/auth.ts/audit.ts, guard.test.ts |
| MIS-37 | MIS-1 | E1-03 · QA · Permission matrix and audit-trail tests | To Do | QA | YES | guard.ts/auth.ts/audit.ts, guard.test.ts; covered by tests |
| MIS-38 | MIS-1 | E1-04 · BE · Navigation config resolved by role on the serv… | To Do | BE | YES | mis-shell.tsx, bottom-nav, lang-toggle, locale-provider |
| MIS-39 | MIS-1 | E1-04 · FE · App shell, bottom navigation and language togg… | To Do | FE | YES | mis-shell.tsx, bottom-nav, lang-toggle, locale-provider |
| MIS-40 | MIS-1 | E1-04 · QA · Role-based navigation and toggle persistence t… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-41 | MIS-1 | E1-05 · BE · Server module employee.ts and migration | To Do | BE | YES | employee.ts, employee-screen/profile-screen |
| MIS-42 | MIS-1 | E1-05 · FE · Employee list, slide-over form and QR badge | To Do | FE | YES | employee.ts, employee-screen/profile-screen |
| MIS-43 | MIS-1 | E1-05 · QA · Full-slice tests and the reference-slice write… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-44 | MIS-1 | E1-06 · BE · Wage type model, code generator and the two sp… | To Do | BE | NO | no MisWageType model; payroll uses one flat DAILY_WAGE_DEFAULT rule |
| MIS-45 | MIS-1 | E1-06 · FE · Owner-only wage screen and code-only pickers | To Do | FE | NO | no MisWageType model; payroll uses one flat DAILY_WAGE_DEFAULT rule |
| MIS-46 | MIS-1 | E1-06 · QA · Money-leak tests across API, export, print and… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-47 | MIS-1 | E1-07 · BE · Visibility resolver and query-level scoping | To Do | BE | NO | no hierarchy/pool visibility resolver found beyond managerId self-relation |
| MIS-48 | MIS-1 | E1-07 · FE · Scoped pickers and honest empty states | To Do | FE | NO | no hierarchy/pool visibility resolver found beyond managerId self-relation |
| MIS-49 | MIS-1 | E1-07 · QA · Cross-role visibility tests | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-50 | MIS-1 | E1-08 · BE · Invite server module and seat-limit guard | To Do | BE | NO | no MIS-specific user mgmt/invite screen or server code found |
| MIS-51 | MIS-1 | E1-08 · FE · User list, invite form and seat counter | To Do | FE | NO | no MIS-specific user mgmt/invite screen or server code found |
| MIS-52 | MIS-1 | E1-08 · QA · Invite lifecycle and seat-limit tests | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-268 | MIS-1 | E1-09 · ⭐ 🔒 Business rule settings — effective-dated, Owner… | To Do | FULLSTACK | YES | business-rules.ts, settings-screen.tsx, MisBusinessRule model |
| MIS-269 | MIS-1 | E1-09 · BE · ⭐ Effective-dated setting store and the as-of… | To Do | BE | YES | business-rules.ts, settings-screen.tsx, MisBusinessRule model |
| MIS-270 | MIS-1 | E1-09 · BE · Seed every rule in BRD §9, and remove the lite… | To Do | BE | YES | business-rules.ts, settings-screen.tsx, MisBusinessRule model |
| MIS-271 | MIS-1 | E1-09 · FE · Owner settings screen with change history | To Do | FE | YES | business-rules.ts, settings-screen.tsx, MisBusinessRule model |
| MIS-272 | MIS-1 | E1-09 · QA · A rule change never moves a number that was al… | To Do | QA | NO | no dedicated test file found for this feature |

## E2 · Master Tables (`MIS-2`)

**33 issues** — YES 22 · PARTIAL 6 · NO 5 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-12 | MIS-2 | E2-01 · ⭐ Generic MasterTable component and MisMasterOption… | To Do | FULLSTACK | YES | master-table.tsx(+test), MisMasterOption, master-option.ts |
| MIS-13 | MIS-2 | E2-02 · Department master | To Do | FULLSTACK | YES | department.ts, department-screen.tsx, MisDepartment |
| MIS-14 | MIS-2 | E2-03 · Machine master | To Do | FULLSTACK | YES | machine.ts, machine-screen.tsx, MisMachine |
| MIS-15 | MIS-2 | E2-04 · Process master | To Do | FULLSTACK | YES | process.ts, process-screen.tsx, MisProcess |
| MIS-16 | MIS-2 | E2-05 · Customer master | To Do | FULLSTACK | YES | customer.ts, customer-screen/detail, MisCustomer |
| MIS-17 | MIS-2 | E2-06 · Raw material master and batch tracking | To Do | BE | PARTIAL | MisItem covers raw materials generically; no batch/lot tracking field |
| MIS-18 | MIS-2 | E2-07 · Simple option masters — GSM, Size, Substrate, Coati… | To Do | FULLSTACK | YES | MASTER_GROUPS (GSM/SIZE/SUBSTRATE/COATING/COLOUR/UNIT/ITEM_TYPE) |
| MIS-19 | MIS-2 | E2-08 · Defect type master with AQL severity | To Do | DATA | NO | no defect-type master; not in MASTER_GROUPS, no severity field anywhere |
| MIS-20 | MIS-2 | E2-09 · Shift master | To Do | FULLSTACK | YES | MisShift model, shifts-screen.tsx |
| MIS-21 | MIS-2 | E2-10 · Master data import from the client spreadsheet | To Do | BE | PARTIAL | xlsx import route exists for inventory items only, not all master types |
| MIS-53 | MIS-2 | E2-01 · BE · MisMasterOption model and generic server module | To Do | BE | YES | master-table.tsx(+test), MisMasterOption, master-option.ts |
| MIS-54 | MIS-2 | E2-01 · FE · <MasterTable/> component with search, slide-ov… | To Do | FE | YES | master-table.tsx(+test), MisMasterOption, master-option.ts |
| MIS-55 | MIS-2 | E2-01 · QA · Generic component tests and the usage guide | To Do | QA | YES | master-table.tsx(+test), MisMasterOption, master-option.ts; covered by tests |
| MIS-56 | MIS-2 | E2-02 · BE · Department model, migration and server module | To Do | BE | YES | department.ts, department-screen.tsx, MisDepartment |
| MIS-57 | MIS-2 | E2-02 · FE · Department master screen | To Do | FE | YES | department.ts, department-screen.tsx, MisDepartment |
| MIS-58 | MIS-2 | E2-03 · BE · MisMachine model, migration and server module | To Do | BE | YES | machine.ts, machine-screen.tsx, MisMachine |
| MIS-59 | MIS-2 | E2-03 · FE · Machine master screen with department grouping | To Do | FE | YES | machine.ts, machine-screen.tsx, MisMachine |
| MIS-60 | MIS-2 | E2-04 · BE · MisProcess model, migration and server module | To Do | BE | YES | process.ts, process-screen.tsx, MisProcess |
| MIS-61 | MIS-2 | E2-04 · FE · Process master screen with machine mapping | To Do | FE | YES | process.ts, process-screen.tsx, MisProcess |
| MIS-62 | MIS-2 | E2-05 · BE · MisCustomer model, migration and server module | To Do | BE | YES | customer.ts, customer-screen/detail, MisCustomer |
| MIS-63 | MIS-2 | E2-05 · FE · Customer master screen | To Do | FE | YES | customer.ts, customer-screen/detail, MisCustomer |
| MIS-64 | MIS-2 | E2-06 · BE · Raw material and batch models, goods-inward se… | To Do | BE | PARTIAL | MisItem covers raw materials generically; no batch/lot tracking field |
| MIS-65 | MIS-2 | E2-06 · FE · Raw material screen and batch entry form | To Do | FE | PARTIAL | MisItem covers raw materials generically; no batch/lot tracking field |
| MIS-66 | MIS-2 | E2-06 · QA · Batch traceability tests | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-67 | MIS-2 | E2-07 · BE · Seed the seven option groups into MisMasterOpt… | To Do | BE | YES | MASTER_GROUPS (GSM/SIZE/SUBSTRATE/COATING/COLOUR/UNIT/ITEM_TYPE) |
| MIS-68 | MIS-2 | E2-07 · FE · Seven option-master screens from the generic c… | To Do | FE | YES | MASTER_GROUPS (GSM/SIZE/SUBSTRATE/COATING/COLOUR/UNIT/ITEM_TYPE) |
| MIS-69 | MIS-2 | E2-08 · BE · MisDefectType model with severity and server m… | To Do | BE | NO | no defect-type master; not in MASTER_GROUPS, no severity field anywhere |
| MIS-70 | MIS-2 | E2-08 · FE · Defect type screen with severity picker | To Do | FE | NO | no defect-type master; not in MASTER_GROUPS, no severity field anywhere |
| MIS-71 | MIS-2 | E2-09 · BE · MisShift model with timings and server module | To Do | BE | YES | MisShift model, shifts-screen.tsx |
| MIS-72 | MIS-2 | E2-09 · FE · Shift master screen with time pickers | To Do | FE | YES | MisShift model, shifts-screen.tsx |
| MIS-73 | MIS-2 | E2-10 · BE · Spreadsheet parser, validator and import serve… | To Do | BE | PARTIAL | xlsx import route exists for inventory items only, not all master types |
| MIS-74 | MIS-2 | E2-10 · FE · Upload screen with preview and error report | To Do | FE | PARTIAL | xlsx import route exists for inventory items only, not all master types |
| MIS-75 | MIS-2 | E2-10 · QA · Import edge-case tests with the real client wo… | To Do | QA | NO | no dedicated test file found for this feature |

## E8 · Platform, Non-functional & Deploy (`MIS-3`)

**25 issues** — YES 13 · PARTIAL 3 · NO 9 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-22 | MIS-3 | E8-01 · i18n scaffold — English and Hindi | To Do | FULLSTACK | YES | src/lib/mis/i18n + index.test.ts, locale-provider, lang-toggle |
| MIS-23 | MIS-3 | E8-02 · ⭐ Shared mobile-first UI kit | To Do | FE | YES | components/mis/kit/* (button, card, input, select, table, skeleton...) |
| MIS-24 | MIS-3 | E8-03 · PWA setup — installable, offline-capable shell | To Do | DEVOPS | PARTIAL | public/manifest.json exists; no service worker found |
| MIS-25 | MIS-3 | E8-04 · Offline write queue and sync indicator | To Do | FULLSTACK | NO | no general offline write queue/sync infra found |
| MIS-26 | MIS-3 | E8-05 · CI gates and branch protection | To Do | DEVOPS | YES | .github/workflows/ci.yml |
| MIS-27 | MIS-3 | E8-06 · Seed and test data scripts | To Do | DATA | YES | prisma/seed.ts, seed-demo.ts, seed-reset.ts |
| MIS-28 | MIS-3 | E8-07 · Deployment runbook and rollback plan | To Do | DOC | YES | docs/11-deployment-plan.md |
| MIS-76 | MIS-3 | E8-01 · BE · Locale resolution, translation loader and Hind… | To Do | BE | YES | src/lib/mis/i18n + index.test.ts, locale-provider, lang-toggle |
| MIS-77 | MIS-3 | E8-01 · FE · Language toggle, t() usage and locale persiste… | To Do | FE | YES | src/lib/mis/i18n + index.test.ts, locale-provider, lang-toggle |
| MIS-78 | MIS-3 | E8-01 · QA · Missing-key detection and translation coverage… | To Do | QA | YES | src/lib/mis/i18n + index.test.ts, locale-provider, lang-toggle; covered by tests |
| MIS-79 | MIS-3 | E8-02 · BE · Design tokens and Tailwind v4 theme configurat… | To Do | BE | YES | components/mis/kit/* (button, card, input, select, table, skeleton...) |
| MIS-80 | MIS-3 | E8-02 · FE · Core components — Button, Input, Select, Card,… | To Do | FE | YES | components/mis/kit/* (button, card, input, select, table, skeleton...) |
| MIS-81 | MIS-3 | E8-02 · QA · Touch-target audit and component tests | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-82 | MIS-3 | E8-03 · BE · Manifest, icons and service-worker registration | To Do | BE | PARTIAL | public/manifest.json exists; no service worker found |
| MIS-83 | MIS-3 | E8-03 · FE · Install prompt, offline shell and app-shell ca… | To Do | FE | PARTIAL | public/manifest.json exists; no service worker found |
| MIS-84 | MIS-3 | E8-03 · QA · Install and offline-shell verification on real… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-85 | MIS-3 | E8-04 · BE · Idempotency keys and server-side conflict reso… | To Do | BE | NO | no general offline write queue/sync infra found |
| MIS-86 | MIS-3 | E8-04 · FE · IndexedDB queue, replay logic and sync indicat… | To Do | FE | NO | no general offline write queue/sync infra found |
| MIS-87 | MIS-3 | E8-04 · QA · Offline, reconnect and duplicate-submit tests | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-88 | MIS-3 | E8-05 · DevOps · GitHub Actions workflow and branch protect… | To Do | DEVOPS | YES | .github/workflows/ci.yml |
| MIS-89 | MIS-3 | E8-05 · QA · Prove the gates actually block, and brief Sank… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-90 | MIS-3 | E8-06 · BE · Seed scripts with the client's real master data | To Do | BE | YES | prisma/seed.ts, seed-demo.ts, seed-reset.ts |
| MIS-91 | MIS-3 | E8-06 · QA · Test factories and idempotency verification | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-92 | MIS-3 | E8-07 · Docs · Runbook, environment reference and release l… | To Do | DOC | YES | docs/11-deployment-plan.md |
| MIS-93 | MIS-3 | E8-07 · QA · Rehearse a rollback and run the smoke checklist | To Do | QA | NO | no dedicated test file found for this feature |

## E4 · Assignment Engine & Machine Scheduling (`MIS-94`)

**11 issues** — YES 3 · PARTIAL 0 · NO 8 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-95 | MIS-94 | E4-01 · ⭐ Machine allocation log, job sequence and live ava… | To Do | FULLSTACK | YES | machines-board.ts, machine-board-screen.tsx, MisMachineAllocation |
| MIS-96 | MIS-94 | E4-01 · BE · Allocation model, overlap constraint and avail… | To Do | BE | YES | machines-board.ts, machine-board-screen.tsx, MisMachineAllocation |
| MIS-97 | MIS-94 | E4-01 · FE · Machine board with red/green dots and per-mach… | To Do | FE | YES | machines-board.ts, machine-board-screen.tsx, MisMachineAllocation |
| MIS-98 | MIS-94 | E4-01 · QA · Concurrency, overlap and cross-department visi… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-260 | MIS-94 | E4-02 · Worker allocation to process, machine and shift | To Do | BE | NO | no worker-allocation model/code found |
| MIS-261 | MIS-94 | E4-03 · Wire allocations to job cards and orders | To Do | BE | NO | depends on E4-02; no job-card/order wiring found |
| MIS-262 | MIS-94 | E4-02 · BE · MisWorkerAllocation and derived worker availab… | To Do | BE | NO | no worker-allocation model/code found |
| MIS-263 | MIS-94 | E4-02 · FE · Worker availability board and crew assignment | To Do | FE | NO | no worker-allocation model/code found |
| MIS-264 | MIS-94 | E4-02 · QA · Availability, overlaps and pool boundaries | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-265 | MIS-94 | E4-03 · BE · Foreign keys, phase check and the migration | To Do | BE | NO | depends on E4-02; no job-card/order wiring found |
| MIS-266 | MIS-94 | E4-03 · QA · The seam holds — board, utilisation and histor… | To Do | QA | NO | no dedicated test file found for this feature |

## E5 · Orders, BOM & Job Cards (`MIS-99`)

**35 issues** — YES 14 · PARTIAL 12 · NO 9 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-100 | MIS-99 | E5-01 · Order model, creation and Order ID generation | To Do | FULLSTACK | YES | orders.ts, MisOrder, orders route |
| MIS-101 | MIS-99 | E5-02 · ⭐ BOM tree — model and server module | To Do | BE | YES | bom.ts, MisBom/MisBomStage/MisBomMaterial |
| MIS-102 | MIS-99 | E5-03 · BOM builder screen | To Do | FE | YES | bom-screen.tsx, bom route |
| MIS-103 | MIS-99 | E5-04 · 🔒 BOM costing and Owner-only money | To Do | BE | PARTIAL | ratePerUnit on MisBomMaterial exists; no explicit cost-rollup/Owner-only gate in bom.ts |
| MIS-104 | MIS-99 | E5-05 · BOM approval gate and versioning | To Do | BE | PARTIAL | submitBomForApproval/approveBom exist; no version field/history on MisBom |
| MIS-105 | MIS-99 | E5-06 · ⭐ Job card template builder | To Do | FE | PARTIAL | no configurable template model; job card derives directly from BOM stages |
| MIS-106 | MIS-99 | E5-07 · Job card generation from an approved BOM | To Do | FULLSTACK | YES | print/job-card route reads BOM + production data |
| MIS-107 | MIS-99 | E5-08 · Job card print layout | To Do | FE | YES | print/job-card screen exists |
| MIS-108 | MIS-99 | E5-09 · Customer purchase order capture | To Do | BE | PARTIAL | no customer-PO-number field on MisOrder; PO only attachable as a document |
| MIS-109 | MIS-99 | E5-01 · BE · Order model, Order ID generator and server mod… | To Do | BE | YES | orders.ts, MisOrder, orders route |
| MIS-110 | MIS-99 | E5-01 · FE · Order list and order form | To Do | FE | YES | orders.ts, MisOrder, orders route |
| MIS-111 | MIS-99 | E5-01 · QA · Order numbering under concurrency | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-112 | MIS-99 | E5-02 · BE · MisBomNode tree schema and migration | To Do | BE | YES | bom.ts, MisBom/MisBomStage/MisBomMaterial |
| MIS-113 | MIS-99 | E5-02 · BE · BOM server module — read, write, clone | To Do | BE | YES | bom.ts, MisBom/MisBomStage/MisBomMaterial |
| MIS-114 | MIS-99 | E5-02 · QA · BOM tree integrity and money isolation | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-115 | MIS-99 | E5-03 · FE · BOM tree view — expand, collapse, reorder | To Do | FE | YES | bom-screen.tsx, bom route |
| MIS-116 | MIS-99 | E5-03 · FE · Node editor, item picker and clone-from-existi… | To Do | FE | YES | bom-screen.tsx, bom route |
| MIS-117 | MIS-99 | E5-03 · QA · Rebuild both real BOMs on a phone | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-118 | MIS-99 | E5-04 · BE · Costing columns and the Owner-only server func… | To Do | BE | PARTIAL | ratePerUnit on MisBomMaterial exists; no explicit cost-rollup/Owner-only gate in bom.ts |
| MIS-119 | MIS-99 | E5-04 · FE · Owner costing view on the BOM screen | To Do | FE | PARTIAL | ratePerUnit on MisBomMaterial exists; no explicit cost-rollup/Owner-only gate in bom.ts |
| MIS-120 | MIS-99 | E5-04 · QA · Money leak hunt across every BOM surface | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-121 | MIS-99 | E5-05 · BE · Approval state machine and BOM versioning | To Do | BE | PARTIAL | submitBomForApproval/approveBom exist; no version field/history on MisBom |
| MIS-122 | MIS-99 | E5-05 · FE · Owner approval queue and version history | To Do | FE | PARTIAL | submitBomForApproval/approveBom exist; no version field/history on MisBom |
| MIS-123 | MIS-99 | E5-05 · QA · Gate cannot be bypassed | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-124 | MIS-99 | E5-06 · BE · Template schema and server module | To Do | BE | PARTIAL | no configurable template model; job card derives directly from BOM stages |
| MIS-125 | MIS-99 | E5-06 · FE · Template builder screen | To Do | FE | PARTIAL | no configurable template model; job card derives directly from BOM stages |
| MIS-126 | MIS-99 | E5-06 · QA · Build a new template without touching code | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-127 | MIS-99 | E5-07 · BE · Generate a job card from an approved BOM | To Do | BE | YES | print/job-card route reads BOM + production data |
| MIS-128 | MIS-99 | E5-07 · FE · Job card screen and issue flow | To Do | FE | YES | print/job-card route reads BOM + production data |
| MIS-129 | MIS-99 | E5-07 · QA · End-to-end PO → order → BOM → approval → job c… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-130 | MIS-99 | E5-08 · FE · Print route and A4 stylesheet | To Do | FE | YES | print/job-card screen exists |
| MIS-131 | MIS-99 | E5-08 · QA · Print on real paper, side by side with the Exc… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-132 | MIS-99 | E5-09 · BE · PO model, server module and order generation | To Do | BE | PARTIAL | no customer-PO-number field on MisOrder; PO only attachable as a document |
| MIS-133 | MIS-99 | E5-09 · FE · PO capture form, attachment and order creation | To Do | FE | PARTIAL | no customer-PO-number field on MisOrder; PO only attachable as a document |
| MIS-134 | MIS-99 | E5-09 · QA · Capture the real sample PO and every duplicate… | To Do | QA | NO | no dedicated test file found for this feature |

## E6 · Production & Wastage — the BPR spine (`MIS-135`)

**35 issues** — YES 9 · PARTIAL 8 · NO 18 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-136 | MIS-135 | E6-01 · ⭐ Phase model and the sign-off state machine | To Do | BE | PARTIAL | MisBomStage exists but no explicit sign-off state machine/status field |
| MIS-137 | MIS-135 | E6-02 · Line clearance | To Do | BE | NO | no line-clearance concept in schema or code |
| MIS-138 | MIS-135 | E6-03 · ⭐ Production entry — the 2–3 tap screen | To Do | FULLSTACK | YES | production-screen.tsx, logProduction() |
| MIS-139 | MIS-135 | E6-04 · Offline production entry and idempotent sync | To Do | FULLSTACK | NO | no offline queue infra (see E8-04) |
| MIS-140 | MIS-135 | E6-05 · Material consumption and batch traceability | To Do | BE | PARTIAL | traceability.ts/getOrderTrace exists; no batch/lot tracking (see E2-06) |
| MIS-141 | MIS-135 | E6-06 · Wastage capture and roll-up | To Do | FULLSTACK | YES | qtyWaste field, getDayProductionSummary, reports.ts getProductionReport |
| MIS-142 | MIS-135 | E6-07 · Phase sign-off and the handover gate | To Do | BE | NO | no phase sign-off/handover gate found (see E6-01) |
| MIS-143 | MIS-135 | E6-08 · Live order status board | To Do | FULLSTACK | YES | updateOrderStatus, orders-screen, machine-board, owner-home |
| MIS-144 | MIS-135 | E6-09 · Batch Production Record print | To Do | FE | PARTIAL | print/job-card exists; no distinct BPR print route confirmed |
| MIS-145 | MIS-135 | E6-01 · BE · MisJobPhase schema and transition table | To Do | BE | PARTIAL | MisBomStage exists but no explicit sign-off state machine/status field |
| MIS-146 | MIS-135 | E6-01 · BE · Gating server module and the database check co… | To Do | BE | PARTIAL | MisBomStage exists but no explicit sign-off state machine/status field |
| MIS-147 | MIS-135 | E6-01 · QA · Every path around the gate | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-148 | MIS-135 | E6-02 · BE · MisLineClearance model and the production prec… | To Do | BE | NO | no line-clearance concept in schema or code |
| MIS-149 | MIS-135 | E6-02 · FE · Clear-line action and clearance history | To Do | FE | NO | no line-clearance concept in schema or code |
| MIS-150 | MIS-135 | E6-02 · QA · Clearance expiry and role boundaries | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-151 | MIS-135 | E6-03 · BE · MisProductionEntry model and recording server… | To Do | BE | YES | production-screen.tsx, logProduction() |
| MIS-152 | MIS-135 | E6-03 · FE · The two-tap entry screen | To Do | FE | YES | production-screen.tsx, logProduction() |
| MIS-153 | MIS-135 | E6-03 · QA · Time the screen with a real supervisor | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-154 | MIS-135 | E6-04 · BE · Server-side idempotency for production writes | To Do | BE | NO | no offline queue infra (see E8-04) |
| MIS-155 | MIS-135 | E6-04 · FE · Queue integration and the sync indicator | To Do | FE | NO | no offline queue infra (see E8-04) |
| MIS-156 | MIS-135 | E6-04 · QA · Lose the connection at every stage | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-157 | MIS-135 | E6-05 · BE · Consumption model and traceability queries | To Do | BE | PARTIAL | traceability.ts/getOrderTrace exists; no batch/lot tracking (see E2-06) |
| MIS-158 | MIS-135 | E6-05 · FE · Consumption screen and traceability views | To Do | FE | PARTIAL | traceability.ts/getOrderTrace exists; no batch/lot tracking (see E2-06) |
| MIS-159 | MIS-135 | E6-05 · QA · Trace a batch across several orders | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-160 | MIS-135 | E6-06 · BE · Wastage aggregates and the sign-off reason req… | To Do | BE | YES | qtyWaste field, getDayProductionSummary, reports.ts getProductionReport |
| MIS-161 | MIS-135 | E6-06 · FE · Wastage totals on phase, order and machine | To Do | FE | YES | qtyWaste field, getDayProductionSummary, reports.ts getProductionReport |
| MIS-162 | MIS-135 | E6-06 · QA · Totals tie out against a hand-checked fixture | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-163 | MIS-135 | E6-07 · BE · Sign-off preconditions and notification | To Do | BE | NO | no phase sign-off/handover gate found (see E6-01) |
| MIS-164 | MIS-135 | E6-07 · FE · Sign-off summary screen and my-sign-offs list | To Do | FE | NO | no phase sign-off/handover gate found (see E6-01) |
| MIS-165 | MIS-135 | E6-07 · QA · Sign-off cannot be faked or forced | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-166 | MIS-135 | E6-08 · BE · One grouped query for the whole board | To Do | BE | YES | updateOrderStatus, orders-screen, machine-board, owner-home |
| MIS-167 | MIS-135 | E6-08 · FE · Order board and order detail timeline | To Do | FE | YES | updateOrderStatus, orders-screen, machine-board, owner-home |
| MIS-168 | MIS-135 | E6-08 · QA · Board correctness and performance at scale | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-169 | MIS-135 | E6-09 · FE · BPR print route | To Do | FE | PARTIAL | print/job-card exists; no distinct BPR print route confirmed |
| MIS-170 | MIS-135 | E6-09 · QA · Print a BPR beside the client's blank form | To Do | QA | NO | no dedicated test file found for this feature |

## E7 · Quality, COA, Documents & Reports (`MIS-171`)

**49 issues** — YES 18 · PARTIAL 17 · NO 14 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-172 | MIS-171 | E7-01 · ⭐ Checklist templates, items and slot-time configur… | To Do | BE | PARTIAL | fixed QC_FIRST_SLOT_HOUR/QC_SLOT_COUNT constants; no configurable checklist-template model |
| MIS-173 | MIS-171 | E7-02 · ⭐ Hourly QC grid capture | To Do | FULLSTACK | YES | qc-grid-screen.tsx, getTodayQcBoard(), QcSlot logic |
| MIS-174 | MIS-171 | E7-03 · Defect logging and immediate notification | To Do | BE | PARTIAL | addQcCheck records fail/defect; no notification dispatch code found |
| MIS-175 | MIS-171 | E7-04 · 🔒 AQL calculation with configurable thresholds | To Do | BE | NO | no AQL model/calculation anywhere in schema or qc.ts |
| MIS-176 | MIS-171 | E7-05 · Finished goods sampling and final QC | To Do | BE | PARTIAL | QC module is generic; no distinct FG sampling/final-QC flow |
| MIS-177 | MIS-171 | E7-06 · QC report per Order ID | To Do | FULLSTACK | YES | reports.ts getQcReport, qc-detail-screen.tsx |
| MIS-178 | MIS-171 | E7-07 · ⭐ Certificate of Analysis generation | To Do | FULLSTACK | YES | print/coa route exists |
| MIS-179 | MIS-171 | E7-08 · Document model, naming and versioning | To Do | BE | PARTIAL | MisDocument model exists (name, filePath); no versioning field |
| MIS-180 | MIS-171 | E7-09 · Document storage on IDrive e2 and retrieval | To Do | FULLSTACK | YES | server/storage (S3-compatible driver + s3-upload.ts), documents.ts |
| MIS-181 | MIS-171 | E7-10 · Order status and traceability reports | To Do | FULLSTACK | YES | traceability-screen.tsx, getOrderTrace, reports-screen |
| MIS-182 | MIS-171 | E7-11 · Machine utilisation, wastage and defect reports | To Do | BE | PARTIAL | getProductionReport covers wastage; no machine-utilisation metric found |
| MIS-183 | MIS-171 | E7-12 · Attendance and overtime summary | To Do | FULLSTACK | YES | getAttendanceReport, getMonthSummary |
| MIS-184 | MIS-171 | E7-13 · Owner dashboard with live alerts | To Do | FULLSTACK | PARTIAL | owner-home.tsx has dashboard cards; no live/real-time alert mechanism confirmed |
| MIS-185 | MIS-171 | E7-01 · BE · Template schema, versioning and slot generation | To Do | BE | PARTIAL | fixed QC_FIRST_SLOT_HOUR/QC_SLOT_COUNT constants; no configurable checklist-template model |
| MIS-186 | MIS-171 | E7-01 · FE · Checklist builder screen | To Do | FE | PARTIAL | fixed QC_FIRST_SLOT_HOUR/QC_SLOT_COUNT constants; no configurable checklist-template model |
| MIS-187 | MIS-171 | E7-01 · QA · Rebuild all three checklists and edit one with… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-188 | MIS-171 | E7-02 · BE · Run creation, grid generation and slot writes | To Do | BE | YES | qc-grid-screen.tsx, getTodayQcBoard(), QcSlot logic |
| MIS-189 | MIS-171 | E7-02 · FE · One-column mobile capture and the desktop grid | To Do | FE | YES | qc-grid-screen.tsx, getTodayQcBoard(), QcSlot logic |
| MIS-190 | MIS-171 | E7-02 · QA · Fill a full shift's grid with a real QC inspec… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-191 | MIS-171 | E7-03 · BE · Defect model and transactional notification | To Do | BE | PARTIAL | addQcCheck records fail/defect; no notification dispatch code found |
| MIS-192 | MIS-171 | E7-03 · FE · Defect capture, photo and notification inbox | To Do | FE | PARTIAL | addQcCheck records fail/defect; no notification dispatch code found |
| MIS-193 | MIS-171 | E7-03 · QA · Notification reaches everyone it should, every… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-194 | MIS-171 | E7-04 · BE · AQL engine and effective-dated thresholds | To Do | BE | NO | no AQL model/calculation anywhere in schema or qc.ts |
| MIS-195 | MIS-171 | E7-04 · FE · AQL breakdown display and threshold settings s… | To Do | FE | NO | no AQL model/calculation anywhere in schema or qc.ts |
| MIS-196 | MIS-171 | E7-04 · QA · Every AQL boundary, and a threshold change | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-197 | MIS-171 | E7-05 · BE · Final inspection model, override and precondit… | To Do | BE | PARTIAL | QC module is generic; no distinct FG sampling/final-QC flow |
| MIS-198 | MIS-171 | E7-05 · FE · Sampling screen with live AQL | To Do | FE | PARTIAL | QC module is generic; no distinct FG sampling/final-QC flow |
| MIS-199 | MIS-171 | E7-05 · QA · Reject, rework, re-sample, accept | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-200 | MIS-171 | E7-06 · BE · QC report assembly in bounded queries | To Do | BE | YES | reports.ts getQcReport, qc-detail-screen.tsx |
| MIS-201 | MIS-171 | E7-06 · FE · QC report screen and A4 landscape print | To Do | FE | YES | reports.ts getQcReport, qc-detail-screen.tsx |
| MIS-202 | MIS-171 | E7-07 · BE · COA generation, storage and versioning | To Do | BE | YES | print/coa route exists |
| MIS-203 | MIS-171 | E7-07 · FE · COA layout matching the client's certificate | To Do | FE | YES | print/coa route exists |
| MIS-204 | MIS-171 | E7-07 · QA · Overlay the generated COA on the original | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-205 | MIS-171 | E7-08 · BE · MisDocument model and versioning service | To Do | BE | PARTIAL | MisDocument model exists (name, filePath); no versioning field |
| MIS-206 | MIS-171 | E7-08 · QA · Versioning, permission and retrieval after ren… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-207 | MIS-171 | E7-09 · BE · e2 upload, verification and signed URLs | To Do | BE | YES | server/storage (S3-compatible driver + s3-upload.ts), documents.ts |
| MIS-208 | MIS-171 | E7-09 · FE · Documents panel and upload with progress | To Do | FE | YES | server/storage (S3-compatible driver + s3-upload.ts), documents.ts |
| MIS-209 | MIS-171 | E7-09 · QA · Break the storage path deliberately | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-210 | MIS-171 | E7-10 · BE · Status aggregates and two-way trace queries | To Do | BE | YES | traceability-screen.tsx, getOrderTrace, reports-screen |
| MIS-211 | MIS-171 | E7-10 · FE · Status and traceability screens | To Do | FE | YES | traceability-screen.tsx, getOrderTrace, reports-screen |
| MIS-212 | MIS-171 | E7-10 · QA · Trace at three years of data volume | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-213 | MIS-171 | E7-11 · BE · Utilisation, wastage and defect aggregates | To Do | BE | PARTIAL | getProductionReport covers wastage; no machine-utilisation metric found |
| MIS-214 | MIS-171 | E7-11 · FE · Three report screens with drill-down | To Do | FE | PARTIAL | getProductionReport covers wastage; no machine-utilisation metric found |
| MIS-215 | MIS-171 | E7-12 · BE · Monthly summary aggregate | To Do | BE | YES | getAttendanceReport, getMonthSummary |
| MIS-216 | MIS-171 | E7-12 · FE · Monthly summary screen and payroll export | To Do | FE | YES | getAttendanceReport, getMonthSummary |
| MIS-217 | MIS-171 | E7-13 · BE · Dashboard composition in bounded queries | To Do | BE | PARTIAL | owner-home.tsx has dashboard cards; no live/real-time alert mechanism confirmed |
| MIS-218 | MIS-171 | E7-13 · FE · The five-second dashboard | To Do | FE | PARTIAL | owner-home.tsx has dashboard cards; no live/real-time alert mechanism confirmed |
| MIS-219 | MIS-171 | E7-13 · QA · Time it on Arjun's device-locked account | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-267 | MIS-171 | E7-12 · QA · The report and the payroll engine agree, to th… | To Do | QA | NO | no dedicated test file found for this feature |

## E3 · Attendance & Workforce — including the Android kiosk (`MIS-220`)

**39 issues** — YES 24 · PARTIAL 3 · NO 12 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-221 | MIS-220 | E3-01 · ⭐ Attendance model and the shift-window engine | To Do | FULLSTACK | YES | attendance.ts, MisAttendance, MisShift |
| MIS-222 | MIS-220 | E3-02 · QR badge generation and printing | To Do | FULLSTACK | YES | print/badge route |
| MIS-223 | MIS-220 | E3-03 · ⭐ Kiosk app — scan, operator confirm, offline queue | To Do | FE | PARTIAL | kiosk-screen.tsx (web) exists; no QR-scan/offline-queue code, no native Android wrapper |
| MIS-224 | MIS-220 | E3-04 · Kiosk sync and idempotent punch ingestion | To Do | BE | NO | no kiosk sync/idempotency code found |
| MIS-225 | MIS-220 | E3-05 · Kiosk enrolment and master data pull | To Do | BE | NO | no kiosk enrolment/master-data-pull code found |
| MIS-226 | MIS-220 | E3-06 · 🔒 Lateness, overtime and absence engine | To Do | BE | YES | lateMinutes/otMinutes fields, LATE_PENALTY_PER_MIN/OT_MULTIPLIER rules, markAbsentBulk |
| MIS-227 | MIS-220 | E3-07 · Shift assignment and change | To Do | FULLSTACK | YES | saveShift, listShifts, getCurrentShiftName |
| MIS-228 | MIS-220 | E3-08 · Clock-out approval and forgotten clock-outs | To Do | FULLSTACK | YES | approveClockOut, listPendingClockOutApprovals |
| MIS-229 | MIS-220 | E3-09 · Attendance register and corrections | To Do | FULLSTACK | YES | editAttendance, listAttendance, getDayAttendanceSummary |
| MIS-230 | MIS-220 | E3-10 · Leave recording and approval | To Do | FULLSTACK | YES | requestLeave, approveLeave, leave-screen.tsx |
| MIS-231 | MIS-220 | E3-11 · 🔒 Three-part salary and month-end figures | To Do | FULLSTACK | YES | calculateMonthlyPayroll (basic+OT+penalty), payroll-screen.tsx, print/payslip |
| MIS-232 | MIS-220 | E3-01 · BE · Punch and attendance-day models with rule snap… | To Do | BE | YES | attendance.ts, MisAttendance, MisShift |
| MIS-233 | MIS-220 | E3-01 · BE · ⭐ The shared shift-window helper | To Do | BE | YES | attendance.ts, MisAttendance, MisShift |
| MIS-234 | MIS-220 | E3-01 · QA · A full night shift, end to end | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-235 | MIS-220 | E3-02 · BE · Badge codes, reissue and QR generation | To Do | BE | YES | print/badge route |
| MIS-236 | MIS-220 | E3-02 · FE · Badge screen, sheet print and a real scan test | To Do | FE | YES | print/badge route |
| MIS-237 | MIS-220 | E3-03 · APP · Expo project, kiosk mode and the scan-confirm… | To Do | FE | PARTIAL | kiosk-screen.tsx (web) exists; no QR-scan/offline-queue code, no native Android wrapper |
| MIS-238 | MIS-220 | E3-03 · APP · SQLite queue, local employee cache and deboun… | To Do | FE | PARTIAL | kiosk-screen.tsx (web) exists; no QR-scan/offline-queue code, no native Android wrapper |
| MIS-239 | MIS-220 | E3-03 · QA · A simulated shift change, offline, on the real… | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-240 | MIS-220 | E3-04 · BE · Punch ingestion endpoint and day rebuild | To Do | BE | NO | no kiosk sync/idempotency code found |
| MIS-241 | MIS-220 | E3-04 · APP · Sync loop, backoff and failure surfacing | To Do | FE | NO | no kiosk sync/idempotency code found |
| MIS-242 | MIS-220 | E3-04 · QA · Break the sync at every point | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-243 | MIS-220 | E3-05 · BE · Device model, enrolment and the minimal pull p… | To Do | BE | NO | no kiosk enrolment/master-data-pull code found |
| MIS-244 | MIS-220 | E3-05 · FE/APP · Enrolment flow, device list and staleness… | To Do | BE | NO | no kiosk enrolment/master-data-pull code found |
| MIS-245 | MIS-220 | E3-06 · BE · Daily calculations — lateness, hours, overtime… | To Do | BE | YES | lateMinutes/otMinutes fields, LATE_PENALTY_PER_MIN/OT_MULTIPLIER rules, markAbsentBulk |
| MIS-246 | MIS-220 | E3-06 · BE · Monthly adjustments — worker lateness, Sunday… | To Do | BE | YES | lateMinutes/otMinutes fields, LATE_PENALTY_PER_MIN/OT_MULTIPLIER rules, markAbsentBulk |
| MIS-247 | MIS-220 | E3-06 · QA · Every rule in §9.1 as a named test | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-248 | MIS-220 | E3-07 · BE · MisEmployeeShift effective-dated assignments | To Do | BE | YES | saveShift, listShifts, getCurrentShiftName |
| MIS-249 | MIS-220 | E3-07 · FE · Shift assignment screen with bulk rotate | To Do | FE | YES | saveShift, listShifts, getCurrentShiftName |
| MIS-250 | MIS-220 | E3-08 · BE · Approval state, missing-punch detection and ma… | To Do | BE | YES | approveClockOut, listPendingClockOutApprovals |
| MIS-251 | MIS-220 | E3-08 · FE · Operator dashboard — approvals, missing punche… | To Do | FE | YES | approveClockOut, listPendingClockOutApprovals |
| MIS-252 | MIS-220 | E3-09 · BE · Register queries and the correction window | To Do | BE | YES | editAttendance, listAttendance, getDayAttendanceSummary |
| MIS-253 | MIS-220 | E3-09 · FE · Daily register and employee month view | To Do | FE | YES | editAttendance, listAttendance, getDayAttendanceSummary |
| MIS-254 | MIS-220 | E3-09 · QA · Correction windows and the night-shift register | To Do | QA | NO | no dedicated test file found for this feature |
| MIS-255 | MIS-220 | E3-10 · BE · Leave model, entitlement check and conflict de… | To Do | BE | YES | requestLeave, approveLeave, leave-screen.tsx |
| MIS-256 | MIS-220 | E3-10 · FE · Leave screen, calendar and approval | To Do | FE | YES | requestLeave, approveLeave, leave-screen.tsx |
| MIS-257 | MIS-220 | E3-11 · BE · Three component calculators and month close | To Do | BE | YES | calculateMonthlyPayroll (basic+OT+penalty), payroll-screen.tsx, print/payslip |
| MIS-258 | MIS-220 | E3-11 · FE · Owner month view showing the working | To Do | FE | YES | calculateMonthlyPayroll (basic+OT+penalty), payroll-screen.tsx, print/payslip |
| MIS-259 | MIS-220 | E3-11 · QA · Check one month against Arjun's own calculation | To Do | QA | NO | no dedicated test file found for this feature |

## E9 · Purchase Orders, GRN & Store Inventory (`MIS-273`)

**22 issues** — YES 16 · PARTIAL 5 · NO 1 — epic rollup: **PARTIAL**

| key | epic | summary | jira status | layer | built? | notes |
|---|---|---|---|---|---|---|
| MIS-273 | MIS-273 | E9 · Purchase Orders, GRN & Store Inventory | To Do | DOC | PARTIAL | epic marker (typed Task, not Epic); mixed underlying build state, see children |
| MIS-274 | MIS-273 | E9-01 · BE · Inventory item master, STORE role and migration | To Do | BE | YES | MisInventoryItem/MisItem, STORE_GUY role in MisRole enum, item.ts |
| MIS-275 | MIS-273 | E9-02 · BE · Purchase order model and configurable approval… | To Do | BE | PARTIAL | po.ts has submitForApproval/approvePO; single-step only, not configurable multi-tier |
| MIS-276 | MIS-273 | E9-03 · BE · GRN — partial receipt, per-GRN pricing and sho… | To Do | BE | YES | grn.ts addGRNItem/confirmGRN + store.ts commitReceipt cover partial receipt |
| MIS-277 | MIS-273 | E9-04 · FE · Store dashboard and the cart-style GRN verify… | To Do | FE | YES | store-dashboard-screen.tsx, grn-detail-screen.tsx, item-cart.tsx (cart-style verify) |
| MIS-278 | MIS-273 | E9-05 · FE · PO raise and approve screens, plus the Owner P… | To Do | FE | YES | po-list-screen.tsx, po-detail-screen.tsx |
| MIS-279 | MIS-273 | E9-06 · QA · Partial-receipt arithmetic, approval chain and… | To Do | QA | NO | no test files found for po.ts/grn.ts/store.ts arithmetic or RBAC |
| MIS-280 | MIS-273 | Master data schema: SKU, name, description, unit, category,… | To Do | DATA | YES | MisItem model: sku, name, category, unit, gsm, size, substrate, pricePerUnit |
| MIS-281 | MIS-273 | Admin: master data list screen with search and category fil… | To Do | FE | YES | item-screen.tsx / inventory-screen.tsx list with search/filter |
| MIS-282 | MIS-273 | Admin: add / edit item form with validation | To Do | FE | YES | item-screen.tsx add/edit form, item.ts createItem/updateItem |
| MIS-283 | MIS-273 | Admin: soft-delete (deactivate) master data item | To Do | BE | YES | item.ts deleteItem/restoreItem, store.ts deactivateStoreItem (soft delete) |
| MIS-284 | MIS-273 | Seed demo prices for all 146 master data items | To Do | DATA | PARTIAL | prisma/seed-demo.ts seeds items; count vs. 146-item target not verified |
| MIS-285 | MIS-273 | Audit log for master data changes (who changed price, when,… | To Do | BE | YES | audit.ts logAuditEvent used broadly incl. master data writes |
| MIS-286 | MIS-273 | Excel import of master data template with duplicate-SKU skip | To Do | BE | YES | api/mis/inventory/import + /template routes, xlsx dependency |
| MIS-287 | MIS-273 | Roles and permissions: owner, admin, store | To Do | BE | YES | MisRole: OWNER/ADMIN/.../STORE_GUY; guard.ts permission matrix |
| MIS-288 | MIS-273 | Store screen: stock IN (material received) entry | To Do | FULLSTACK | YES | receive-screen.tsx, store.ts createStoreIn/commitReceipt |
| MIS-289 | MIS-273 | Store screen: stock OUT (material issued) entry | To Do | FULLSTACK | YES | issue-screen.tsx, store.ts createStoreOut/commitIssue |
| MIS-290 | MIS-273 | Store screen: current stock list (item and quantity only) | To Do | FULLSTACK | YES | store-stock-screen.tsx, store.ts listStockSummary |
| MIS-291 | MIS-273 | Store screen: physical stock count entry | To Do | FULLSTACK | YES | store-count-screen.tsx, store.ts recordPhysicalCount |
| MIS-292 | MIS-273 | Closing stock calculation and discrepancy engine | To Do | BE | PARTIAL | recordPhysicalCount/listPhysicalCounts exist; explicit discrepancy engine not confirmed |
| MIS-293 | MIS-273 | Reorder level field and low-stock list | To Do | BE | YES | MisItem.reorderLevel field; store-dashboard low-stock stat |
| MIS-294 | MIS-273 | Weekly role-wise reports: owner full, admin short, store qu… | To Do | BE | PARTIAL | reports.ts getStoreReport + role-gated reports-screen; no weekly-cadence scheduler found |
