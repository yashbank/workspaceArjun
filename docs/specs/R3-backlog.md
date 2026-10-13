# R3 backlog: deduped audit findings + owner-approved scope (2026-10-13)

Sources: `docs/specs/audit/{STK,ORD,SEC,ATT,WRK}.md` (123 findings: STK 27, ORD 28, SEC 21, ATT 26, WRK 21 + 15 WRK design gaps G1-G15) and the owner-approved R3 scope list. Disputed claims were settled by grep (STK-01, SEC-01, WRK-01, ORD-14 and ATT-05 confirmed real on 2026-10-13).

**Totals:** 123 findings → **118 kept**, **5 dropped**. Two of the kept findings ship only in part: STK-12 (warning only) and ATT-22 (message only). The kept findings, 13 owner-scope items and the WRK design gaps make 135 rows (B01-B135). Several rows merge duplicate findings.

Rank: **P0** = wrong money, wrong stock, lost data or a security breach on a path used today. **P1** = Major: wrong state reachable through normal use. **P2** = Minor: hardening or UX.
Clusters: see `R3-README.md`. W = wave. S = needs a schema change.

## Cross-cutting classes (split by file owner, not by class)
- **X1 raw errors / no `asResult`:** STK-13, ORD-05, SEC-18, ATT-25 (actions part), WRK-06. The cluster that owns each `actions.ts` file wraps it. The exact files are listed in each cluster spec.
- **X2 factory-time misuse (rule 9):** STK-22, ORD-12, ORD-22, ORD-23, ORD-28, ATT-24, ATT-25, WRK-04, WRK-20. The owner of each file fixes it.
- **X3 tests that only assert mocks:** WRK-21. Every cluster writes its repro test first.

## Backlog

| # | Rank | Sources | Item | Cluster | W | S |
|---|---|---|---|---|---|---|
| B01 | P0 | STK-01 | `confirmGRN` moves the PO to PARTIAL/COMPLETE (shared helper with `commitReceipt`) | STK | 1 | N |
| B02 | P0 | STK-02 | Server guard: GRN create/confirm only on an open PO (APPROVED/PARTIAL; re-check in tx) | STK | 1 | N |
| B03 | P0 | STK-03 + scope | Receipt cap everywhere: lock the PO line; ordered + 2% tolerance; beyond that only ADMIN/OWNER, with a reason | STK | 1 | N |
| B04 | P0 | STK-10 | `confirmGRN` books from lines re-read inside the tx; draft writes are status-conditional | STK | 1 | N |
| B05 | P1 | STK-04 | `nextTxnSeq` takes a global advisory key (no P2002 on concurrent moves) | STK | 1 | N |
| B06 | P1 | STK-05 | GRN number: attempt offset + P2002 retry + factory month | STK | 1 | N |
| B07 | P1 | STK-06 | `adjustInventory` writes both books; reason >= 3 chars (server) | STK | 1 | N |
| B08 | P1 | STK-08 | `commitIssue` checks min(ledger, txn); never a negative store book | STK | 1 | N |
| B09 | P1 | STK-09 | Reconcile uses the current balance; one reconcile per item per count day | STK | 1 | N |
| B10 | P1 | STK-11 | Invoice match covers every confirmed GRN of the PO naming that invoice no. | STK | 1 | N |
| B11 | P1 | STK-25 | Receive/issue cart idempotency key (reuses `runIdempotent`, kind string) | STK | 1 | N |
| B12 | P2 | STK-12 (warn only) | Warn when the same supplier invoice no. exists on another PO | STK | 1 | N |
| B13 | P2 | STK-14 | Quantity validation (finite, >0, 2 dp; count >= 0) | STK | 1 | N |
| B14 | P2 | STK-17 | `updateStoreItemProps` validation (reorder >= 0, category enum) | STK | 1 | N |
| B15 | P2 | STK-22 | Store factory-time fixes | STK | 1 | N |
| B16 | P2 | STK-23 | Stock value rounded server-side; client receives formatted strings (Owner only) | STK | 1 | N |
| B17 | P2 | STK-24 | One low-stock predicate | STK | 1 | N |
| B18 | P2 | STK-26 | GRN confirm uses `useConfirm` | STK | 1 | N |
| B19 | P2 | STK-27 | e2e cleanup script: no time-window delete, recompute balances, parametrised item | STK | 1 | N |
| B20 | P2 | SEC-19 | Material-request approve claim + issue in one tx | STK | 1 | N |
| B21 | P2 | X1 (store, grn, supplier-invoices actions) | `asResult` wrap | STK | 1 | N |
| B22 | — | scope | Keep supplier-invoice tolerance (GREATEST(1.00, 0.5%)): regression test only | STK | 1 | N |
| B23 | P1 | STK-15, SEC-11 | Import route: size/row cap, try/catch, update only present columns, skip deleted items, friendly errors, audit price | MST | 1 | N |
| B24 | P1 | STK-16, SEC-11e + scope | Item codes `ITM-0001` from the max existing code + P2002 retry; ADMIN/OWNER can edit a code | MST | 1 | N |
| B25 | P1 | STK-07 | Adjust dialog: `asResult`, inline error, required reason | MST | 1 | N |
| B26 | P0 | STK-18, SEC-06 | PO line validation; `ratePerUnit` written only with `wages.read` | MST | 1 | N |
| B27 | P2 | STK-19 | PO submit requires a supplier and an item on every line | MST | 1 | N |
| B28 | P2 | STK-20 | PO transitions are compare-and-set (`updateMany` with status) | MST | 1 | N |
| B29 | P2 | STK-21 | Supplier/customer delete: refuse with open dependants; confirm dialog; restore checks | MST | 1 | N |
| B30 | P2 | SEC-12 | Template route `requirePermission('masters.write')` | MST | 1 | N |
| B31 | P2 | X1 (inventory, suppliers, customers, po actions) | `asResult` wrap | MST | 1 | N |
| B32 | P1 | scope | Item form: GSM/SIZE/UNIT dropdowns from masters (non-schema part: unit limited to the 4 enum values) | MST | 1 | N |
| B33 | P0 | SEC-01 | Wage fields (`wageTypeCode`, `payType`, `sundayPaid`) need `wages.read` on the server | SEC | 1 | N |
| B34 | P1 | SEC-02 | Audit logs the wage code as `payCode` (no amount) | SEC | 1 | N |
| B35 | P1 | SEC-03 | Non-OWNER cannot edit or delete the OWNER row; nobody can delete their own row | SEC | 1 | N |
| B36 | P1 | SEC-04 | Employee by-id read/write/photo pool-scoped (404 when not visible) | SEC | 1 | N |
| B37 | P1 | SEC-05 | Business-rule values validated; PO threshold and correction window need `wages.read`; P2002 is friendly | SEC | 1 | N |
| B38 | P1 | SEC-10 | `safeHref` enforced in `addDocument` and the traceability screen | SEC | 1 | N |
| B39 | P2 | SEC-13 | Audit page `limit`/`from` validation | SEC | 1 | N |
| B40 | P2 | SEC-15 | `grantMisRole`: `isMisRole`, last-OWNER guard, no reactivation | SEC | 1 | N |
| B41 | P2 | SEC-16 | Admin may assign only roles below ADMIN (default; see owner question Q2) | SEC | 1 | N |
| B42 | P2 | X1 (employees, settings, settings/users, settings/wages, payroll, extra-pay actions) | `asResult` wrap | SEC | 1 | N |
| B43 | P0 | ATT-01 | DEPARTMENTS-scope extra-pay day is applied (resolve department) | SEC | 1 | N |
| B44 | P0 | ATT-02 | Payroll includes active employees with zero attendance rows | SEC | 1 | N |
| B45 | P1 | ATT-03 | ALL_PRESENT extra pay scales with the day fraction; date normalised to a date key | SEC | 1 | N |
| B46 | P1 | ATT-11 | Payroll close: validate month, no current/future month, preflight blockers refuse, one tx | SEC | 1 | N |
| B47 | P2 | ATT-12 | Period lookup error is no longer swallowed | SEC | 1 | N |
| B48 | P1 | ATT-26 | Extra-pay validation, duplicate guard, CAS approve/reject, rejecter recorded | SEC | 1 | N |
| B49 | P2 | SEC-20 | Payslip params clamped; minimal select | SEC | 1 | N |
| B50 | P2 | ATT-25 (payroll part) | Payroll and extra-pay screens use factory time | SEC | 1 | N |
| B51 | P1 | SEC-07, ATT-07 | Register writes: correction window, CLOSED-period refusal (OWNER override + reason), state guards, status enum | ATT | 1 | N |
| B52 | P1 | SEC-08, ATT-04 | `approveLeave`: PENDING only, CAS, no self-approval, before/after audit (role narrowing → Q1) | ATT | 1 | N |
| B53 | P1 | ATT-05 | Approved leave upserts a LEAVE attendance row (skips rows with punches or hand edits) | ATT | 1 | N |
| B54 | P1 | ATT-06 | `requestLeave` validation + no duplicate PENDING/APPROVED | ATT | 1 | N |
| B55 | P1 | SEC-09, ATT-08 | `markAbsentBulk`: skip punched/LEAVE rows, date key, window, one tx, count audit | ATT | 1 | N |
| B56 | P1 | ATT-10 | `saveShift` validation, deactivate, exclusive default | ATT | 1 | N |
| B57 | P1 | ATT-13 | Punch: operator must be an active operator-role employee; unknown shift hint rejected | ATT | 1 | N |
| B58 | P2 | ATT-14 | Punch result carries `note` ALREADY_IN / NO_OPEN_IN | ATT | 1 | N |
| B59 | P1 | ATT-15 | Oversize kiosk body → 413 (not BAD_KEY); punch route limit 16 KB | ATT | 1 | N |
| B60 | P1 | ATT-19 (server) | Pull sends `factoryTimezone`; punch result sends `workDate` | ATT | 1 | N |
| B61 | P2 | ATT-22 (message only) | ALREADY_CLAIMED returns a "ask Admin to retire <name>" hint | ATT | 1 | N |
| B62 | P2 | ATT-24 | Month bounds via factory date key; month picker; `?date=` validated | ATT | 1 | N |
| B63 | P2 | ATT-25 (attendance/leave/shifts), X1 attendance actions | Factory time + `asResult` | ATT | 1 | N |
| B64 | P1 | scope | Permission widening: SUPERVISOR `attendance.note` (new) + `qc.write`; STORE_GUY `orders.read` | ATT | 1 | N |
| B65 | P1 | ATT-16 | Android: drain the queue with the old token before wiping; show the queued count | AND | 1 | N |
| B66 | P1 | ATT-17 | Android: 401 → needs re-pair; attempt cap → STUCK; no head-of-line block | AND | 1 | N |
| B67 | P2 | ATT-18 | Android: record `clientRecordedAt` as the last punch time | AND | 1 | N |
| B68 | P1 | ATT-19 (android) | Android: factory timezone from pull; the work date drives staleness | AND | 1 | N |
| B69 | P2 | ATT-20 | Android: worker returns `retry()` while the queue is non-empty | AND | 1 | N |
| B70 | P2 | ATT-21 | Android: `exportSchema=true`, `MigrationTestHelper` tests | AND | 1 | N |
| B71 | P2 | ATT-14/15 (android) | Android: show punch `note`; 413 → STUCK with a message | AND | 1 | N |
| B72 | P1 | ORD-07 | AQL: sample >= required, qty >= 0, known defect ids | QCR | 1 | N |
| B73 | P1 | ORD-08 | QC check validation (result enum, qty, stage in BOM, order open) | QCR | 1 | N |
| B74 | P1 | ORD-09 | CoA verdict = latest per stage+parameter (resolved FAIL is not FAIL) | QCR | 1 | N |
| B75 | P1 | ORD-10 (CoA) | CoA: load errors are not printed as "no checks" | QCR | 1 | N |
| B76 | P1 | ORD-11 (reports) | New `qty-by-unit` helper; reports group by unit | QCR | 1 | N |
| B77 | P1 | ORD-12 | Report month range in factory time, half-open | QCR | 1 | N |
| B78 | P2 | ORD-13 | Report params clamped; per-report error state | QCR | 1 | N |
| B79 | P2 | ORD-26 | Pass rate excludes N/A | QCR | 1 | N |
| B80 | P2 | ORD-27 | Checklist print: no future date; unknown template → banner | QCR | 1 | N |
| B81 | P2 | ORD-28 | CoA factory dates, order status, warning unless COMPLETED/DELIVERED | QCR | 1 | N |
| B82 | P1 | X1 qc actions | `asResult` for QC actions | QCR | 1 | N |
| B83 | P2 | scope | Read-only report of legacy unkeyed `STORE_ISSUE` ledger rows (owner counts 36) | QCR | 1 | N |
| B84 | P1 | scope (edit part) | Edit a QC check within 24 h | QCR | 1 | N |
| B85 | P0 | WRK-01 (machine side), G5 | New `allocation-release.ts` cascade; `releaseMachine` frees workers | WRK | 1 | N |
| B86 | P1 | WRK-02 | Availability ignores released/expired parent bookings | WRK | 1 | N |
| B87 | P1 | WRK-03, G3 | Several open rows per employee shown; `moveWorker` in one tx | WRK | 1 | N |
| B88 | P1 | WRK-04 | Allocation date = factory date key everywhere | WRK | 1 | N |
| B89 | P1 | WRK-05, WRK-18, G8 | Shared `presence` helper (open punch / leave / absent) | WRK | 1 | N |
| B90 | P1 | WRK-06, WRK-19 | Crew actions `asResult`; result toast; clocked-in chip; Release confirm | WRK | 1 | N |
| B91 | P1 | WRK-07 (tx) | `assignWorkers` in one tx with an advisory lock per employee/date/shift | WRK | 1 | N |
| B92 | P1 | WRK-08, 09, 10, 11, G15 | Validate employees (pool, role, active), shift, date in window, phase from parent; release guarded | WRK | 1 | N |
| B93 | P1 | WRK-12, G1 | Staff any date/shift; bookings overlapping the shift window; "copy yesterday's crew" | WRK | 1 | N |
| B94 | P1 | WRK-13 | Crew page permission guard + `isUuid(shift)` | WRK | 1 | N |
| B95 | P2 | WRK-15 | Badge counts free AND clocked-in | WRK | 1 | N |
| B96 | P2 | WRK-16 | Operator count filtered to today's date/shift | WRK | 1 | N |
| B97 | P1 | WRK-17, ORD-06, X1 machine-board | `allocateMachine` validation + tx lock; release idempotent; actions `asResult` | WRK | 1 | N |
| B98 | P1 | scope (#47) | Worker hard-lock = warning; ADMIN/OWNER override with a reason | WRK | 1 | N |
| B99 | P1 | scope (#40/41/45, board side) | `machine-sync.ts` helper; board flags log/booking mismatch (warn only) | WRK | 1 | N |
| B100 | P2 | G11, G13-lite | Supervisor home: "On machines X / Free Y / Unstaffed bookings Z" | WRK | 1 | N |
| B101 | P2 | G14 | Crew on desktop; "Assign crew" from a machine-board row; release confirm names the workers it frees | WRK | 1 | N |
| B102 | P2 | G10 (no schema) | Manpower report: allocated vs clocked-in vs idle; derived person-hours | WRK | 1 | N |
| B103 | P2 | G12 (server) | `getCrewForOrder(orderId)` reader for the job card | WRK | 1 | N |
| B104 | P0 | ORD-01 | Cancel/complete releases machine+worker bookings and reservations; refuse with a pending BOM/open request unless `confirm` | ORD | 2 | N |
| B105 | P1 | ORD-02 | Close gate "at least one production entry" (override-able) | ORD | 2 | N |
| B106 | P1 | ORD-03 | `updateOrder` / `createBom` refused on closed orders | ORD | 2 | N |
| B107 | P1 | ORD-18 | BOM add stage/material: named fields only + validation | ORD | 2 | N |
| B108 | P2 | ORD-19 | BOM submit/approve requires >= 1 stage + >= 1 material + open order | ORD | 2 | N |
| B109 | P2 | ORD-20 | BOM stage delete refused while logs/checks/phases reference it | ORD | 2 | N |
| B110 | P2 | ORD-21 | Approvals inbox shows an error instead of "nothing pending" | ORD | 2 | N |
| B111 | P1 | ORD-22 (orders) | `listOrdersNeedingAction` in factory time | ORD | 2 | N |
| B112 | P2 | ORD-24, X1 orders/bom/approvals actions | Status actions surface errors; `asResult` wraps | ORD | 2 | N |
| B113 | P1 | ORD-04 | Production refused on DRAFT orders (parkable ORDER_NOT_STARTED) | PRD | 2 | N |
| B114 | P1 | ORD-14 | Discarded parked write is terminal on replay | PRD | 2 | N |
| B115 | P1 | ORD-15 | Waste reason locked after sign-off; before/after audit | PRD | 2 | N |
| B116 | P2 | ORD-16 | Acknowledge FAIL: in-charge, or OWNER/ADMIN with a note | PRD | 2 | N |
| B117 | P1 | ORD-17 | `planPhases` validation + one tx + advisory lock | PRD | 2 | N |
| B118 | P0 | WRK-01 (sign-off) | `signOffPhase` frees workers via `allocation-release.ts` | PRD | 2 | N |
| B119 | P1 | ORD-22 (production) | Day summary in factory time | PRD | 2 | N |
| B120 | P2 | ORD-23 | Production detail: closed state, factory date key, client validation | PRD | 2 | N |
| B121 | P2 | ORD-25 | JOB-mode clearance compares the log's order; inactive machine refused | PRD | 2 | N |
| B122 | P1 | WRK-14, G7 phase 1 | Operator validated; soft warning when not on crew; crew listed first; `shiftId` set | PRD | 2 | N |
| B123 | P1 | scope (#40/41/45, log side) | Production log returns a non-blocking machine/booking warning | PRD | 2 | N |
| B124 | P1 | ORD-11 (production) | Production summary, sign-off summary and detail grouped by unit | PRD | 2 | N |
| B125 | P1 | ORD-10 (job card), WRK-20, G12 | Job card: errors propagate, per-unit totals, crew per phase, factory dates | PRD | 2 | N |
| B126 | P1 | scope (edit part) | Edit a production log within 24 h | PRD | 2 | N |
| B127 | P2 | X1 queue + sign-off actions | `asResult` wraps | PRD | 2 | N |
| B128 | P1 | scope (#17/#34) | Void production log / QC check (reason; drops out of every total) | S1 | 3 | Y |
| B129 | P2 | scope (#48) | Makeready minutes (optional) on production log | S1 | 3 | Y |
| B130 | P1 | scope (#49) | Default shift per employee (form, crew picker, kiosk pull fallback) | S2 | 3 | Y |
| B131 | P1 | WRK-07 (index), G6 | Partial unique index on open worker rows | S2 | 3 | Y |
| B132 | P2 | G4 | `releasedById` + `releaseReason` on worker rows; per-machine/per-person history | S2 | 3 | Y |
| B133 | P2 | G2 | Crew role (OPERATOR/HELPER/INCHARGE), one INCHARGE per booking/date/shift | S2 | 3 | Y |
| B134 | P2 | G9 | Kiosk clock-out releases that day's open worker rows (reason CLOCKED_OUT) | S2 | 3 | Y |
| B135 | P1 | scope (#2/#25) | `mis_items.unit` enum → text; any active UNIT master option allowed | S2 | 3 | Y |

## Not doing (one line each)
- **SEC-14 / ATT-23** enrol rate limit: this is an ops task (Vercel firewall rule on `/api/mis/kiosk/enrol`), not code. Listed for the owner; the global cap stays.
- **SEC-17** bootstrap race: `(auth)` is untouched by invariant, `ALLOW_BOOTSTRAP` is off in production, and it runs once.
- **SEC-21** attendance not pool-scoped: a documented decision (attendance is factory-wide). No change without a product decision.
- **ATT-09** split `attendance.correct` from gate punching: this narrows the gate operator's rights, and the owner approved only widening. Owner question Q1. No change this round.
- **STK-12 hard constraint** `(supplierId, invoiceNo)` unique: only the warning ships. A hard constraint could break legitimate re-use across suppliers' series.
- **ATT-22 token re-issue**: re-issuing a bearer token on a lost response weakens pairing security. Only the clearer message ships.
- **G5 nightly sweep job**: no scheduler. Reads derive "ended" from the parent booking window instead (B86).
- **G7 phase 2** `MisProductionLog.workerAllocationId` and **G10 `startedAt`**: person-hours are derived from max(row created, shift start, clock-in) (B102). Low value for a new column.
- **G13 push notifications** to workers/next supervisor: there is no scheduler and no worker portal. Only the home-card count ships (B100).
- **G9 "show assigned machine on clock-in"**: needs an Android confirm-card change plus a payload contract. Deferred to the worker-portal round.
- **Document versions / two-level sign-off (#46)**: deferred by the owner.
- **BOM material unit dropdown**: the owner scoped the dropdowns to item units only.

## Owner questions (none blocking; defaults are chosen)
- **Q1** ATT-09 / SEC-08: should gate operators lose register edits, shift editing and leave approval (new `attendance.correct`; leave approval needs `approvals.read`)? Default: **no change**. Self-approval is blocked anyway (B52).
- **Q2** SEC-16: may an Admin create another Admin? Default: **no**, roles strictly below ADMIN. OWNER unchanged.
- **Q3** Worker hard-lock (B98) default: an overlap (same date+shift, another machine) or an approved leave **blocks a SUPERVISOR**, who must Move or ask an Admin. ADMIN/OWNER can confirm with a reason. "Not clocked in" (today only) stays a soft warning anyone can confirm.

## Risks to existing behaviour
1. **B03 receipt cap**: today a Store Guy can receive any quantity through the cart. After R3, anything above ordered+2% is refused unless an Admin overrides. A delivery that really is larger needs an Admin or a PO amendment. Tell the Store Guy before Deploy 1.
2. **B01 PO status**: POs fully received through GRN flip to COMPLETE and leave the "New GRN" picker and `listOpenPOs`. Existing APPROVED-but-fully-received POs flip only on their next confirm. A one-off read-only SELECT lists them for the owner (STK spec, acceptance 1).
3. **B07/B08 both books**: Inventory adjustments now move the store book too. Legacy drift between books stays, and B08 refuses issues where min(ledger, txn) is short. Some issues that "worked" will be refused. Run `scripts/recompute-item-balances.sql` (read-only part first) before Deploy 1.
4. **B26 PO rates**: Admin-entered PO rates are ignored. Admin-created PO lines are unpriced until the Owner prices them, and the approval mode is computed on the Owner's prices. An Admin-only PO with no prices goes to Owner approval (BOTH). This is a deliberate behaviour change.
5. **B33 wage fields**: an Admin save that includes unchanged wage fields must still work (compare against stored values). Only a *change* is refused.
6. **B44 payroll lines**: wage bill headcount and gross rise for MONTHLY/allowance employees with no rows. This is correct, but the Owner will see different numbers for open months. Closed months are snapshots and do not change.
7. **B53 leave rows**: approving leave writes LEAVE rows, so payroll leave counts rise for open months.
8. **B51/B55 correction window**: operators can no longer edit rows older than the window or in CLOSED months. The OWNER override with a reason is the escape hatch.
9. **B98 hard-lock**: supervisors who used to confirm overlaps now need an Admin (Q3). This deliberately departs from MIS-262's "always confirmable".
10. **B104 cancel**: cancelling an order now frees its machine/crew bookings and stock reservations. Refusing while a BOM is PENDING_APPROVAL adds one confirm step.
11. **B105 production gate**: orders completed with zero production now need an override reason.
12. **B113 DRAFT production**: offline entries queued against DRAFT orders park (ORDER_NOT_STARTED) instead of applying. They show in the queue inbox.
13. **B64 widening**: STORE_GUY gets the Orders tab, and SUPERVISOR gets QC entry. Both need money-scan tests: BOM/costing must stay redacted for STORE_GUY.
14. **B128 void**: every production/QC total changes once a row is voided. Any reader missed in S1 shows inflated numbers. The S1 coverage test guards this.
15. **B135 unit enum → text**: between the SQL apply and the S2 deploy, the old client writes enum-typed values into a text column (Postgres assignment cast, verified safe: no `where: { unit }` filter exists). Apply that SQL file immediately before the S2 deploy.
16. **Deploy ordering**: wave-3 code selects new columns on every `include`. Deploying it before the SQL is applied returns 500 on production, QC, employees, items and crew pages. The gate in `R3-README.md` must be followed.
