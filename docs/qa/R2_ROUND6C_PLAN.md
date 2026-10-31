# R2 Round 6C: work plan for tester bugs R2-284..R2-295 and R2-308..R2-373 (78 rows, none skipped)

> **Decisions pending.** Every row marked UNCLEAR in section 3 needs an owner answer in `docs/qa/R2_ROUND6C_DECISIONS.md` before the builder touches it. Until a row has a decision, log `BLOCKED_DECISION` for it and move to the next row. Never guess. Rows without UNCLEAR can start immediately.

> **Schema protocol for this round (overrides the "stop after Half A" step of `mis-schema-gate`; owner-approved).** Do NOT stop at schema rows. This Mac can run `pnpm db:generate` (no database needed), so:
> 1. Edit `prisma/schema.prisma`, hand-write additive SQL in `prisma/migrations-pending/<ts>_<name>/migration.sql` (nullable or defaulted columns only, rollback comment block), run `pnpm db:generate`, then do Half B (server code, UI, tests with mocked db) in the same pass.
> 2. NEVER run `pnpm db:deploy`, `db:migrate`, or `mv` a folder into `prisma/migrations/`, and never touch the live database.
> 3. Keep every migration additive so the currently deployed code keeps working before and after it is applied.
> 4. After the LAST batch passes all gates, STOP and send the owner one message: "All batches verified. Apply migrations before I merge:" with the list of pending folders and the exact command `mv prisma/migrations-pending/<folder> prisma/migrations/` for each, then `pnpm db:deploy && pnpm db:generate`. Wait for the owner to say the migrations are applied.
> 5. After that, re-run `tsc`, `eslint`, full `vitest` once more, push, and report "ready to deploy". The owner deploys to `main` from the other Mac; do not merge or push to `main`.
> The only reason to stop earlier is a row marked BLOCKED in `PROGRESS.md`.
>
> **Migrations are applied by the owner from another clone**, not by the builder. The builder must still stop at the FINAL step and wait for the owner's "migrations applied" message; do not skip it even if no one seems to be around.

Bug text (verbatim, the only source for the Mac with no sheet access): `docs/qa/R2_ROUND6C_BUGS.md`. Decisions: `docs/qa/R2_ROUND6C_DECISIONS.md`. Tester message skeleton: `docs/qa/R2_ROUND6C_TESTER_MESSAGE.md`.
Previous round: `R2_ROUND6B_PLAN.md` / `R2_ROUND6B_DECISIONS.md` (merged, c6a44b7). Branch `fix/r2-round6c` from `origin/main`. Log files `docs/qa/round6/MAX_LOG.md`, `PRO_LOG.md` (append-only, line `ID | STATE | sha | note`). Sheet `1dZbhlD4uEtJ8amGx_v-p6MTuKCxoJfqqG2Mq7eqnAtM`, tab Bugs, rows 278-355 (R2-284 at row 278, R2-295 at 289, R2-308 at 290, R2-373 at 355). The sheet has no R2-296..R2-307. Tester build `7633928` (all rows "New Bug", tester result Fail; "Confirmed in <file:line>" comments are the tester's reading, re-verify against HEAD).

## 0. Read first
- `docs/AGENT_GOTCHAS.md` (zsh globs, stale Prisma client, contract tests that pin decisions, night shifts, closed payroll month, kiosk roles).
- Triage each row against HEAD before coding. If already fixed, log ALREADY_FIXED with sha + test, add a characterization test only. Rows flagged "PROBABLY FIXED" below were spotted at planning time; confirm, do not assume.
- Contract pins that WILL change this round (update with `// R2-nnn` comment, log CONTRACT, never delete an assertion): `permission-matrix.test.ts` and `server-gates.test.ts` (311, 330, 331, 332, 342), `audit-payloads.test.ts` money-key list (324, 325, 288), `navigation*.test.ts` (none expected).
- Money safety: no wage/rate figures in audit payloads or non-Owner payloads (324, 325, 288, 363).
- Never guess UNCLEAR rows: log `BLOCKED_DECISION`, move to the next row.
- Shared hot files (serialise work in them, one batch at a time): `src/server/mis/store.ts` (C5, C9), `src/server/mis/job-phases.ts` (C1 295, C2 310/330/331), `src/app/(mis)/mis/print/coa/[id]/page.tsx` (C4), `src/components/mis/store/issue-screen.tsx` + `item-cart.tsx` (C5 client bits, C6), `src/components/mis/attendance/attendance-screen.tsx` (C7), `src/lib/mis/permissions.ts` (C2).

## 1. Batches (ordered)

Order rule: small no-schema server fixes first, permissions next (contract tests), then clearance/machines, QC and print documents, store server rules, store issue UI (shares files with C5, so after it), attendance UI, money rows, and the schema-heavy rows last (one migration per row, additive).

### C1 Small server fixes (no schema)
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-289 | Add RECEIVING to OPEN_PO_STATUSES so supplier delete is blocked | S | src/server/mis/supplier.ts:83 | N | L | Confirmed at HEAD (list is DRAFT, PENDING_APPROVAL, APPROVED, PARTIAL). Check enum has RECEIVING. |
| R2-293 | Customer and Supplier duplicate code: friendly message, catch P2002 | S | src/server/mis/customer.ts, supplier.ts, their action files and slide-over forms | N | L | Same pattern as R2-313 and R2-336 (re-create after soft delete). Use one shared helper. |
| R2-313 | Re-creating a soft-deleted defect type code: restore it or friendly error | M | src/server/mis/defect-type.ts (create ~L27, restore exists ~L71), settings defects screen, prisma unique on code | N | M | HEAD `createDefectType` uppercases code and creates directly: no soft-deleted check. Builder picks: restore the deleted row with new params (audit it), else friendly error. |
| R2-335 | Three-way match: compare invoice numbers trimmed + case-insensitive | S | src/server/mis/supplier-invoice.ts:~89 (g.supplierInvoiceNo === inv.invoiceNo), src/lib/mis/invoice-match.ts | N | L | Same files as 325. Do 335 first. |
| R2-319 | evaluateCloseGates: normalise parameterName `.trim().toLowerCase()` in the key | S | src/lib/mis/order-transitions.ts:103, qc-verdict.ts (reuse its normaliser) | N | L | Confirmed at HEAD. |
| R2-321 | recordAqlSampleAction also revalidates /mis/qc/grid | S | src/app/(mis)/mis/qc/actions.ts:~36 | N | L | Confirmed at HEAD (other actions already revalidate the grid at L21, L50). |
| R2-343 | Wastage % = W / (P + W) x 100; P=0 with W>0 shows 100%, not blank | S | src/server/mis/reports.ts:89 (`ProductionTotal.wastePct`), report screen + tests | N | M: changes numbers on a report | Check other users of wastePct (grep) so all formulas agree. Label "of total input". |
| R2-344 | allocateItemCode: use SQL max/aggregate or sequence instead of findMany over all items | M | src/server/mis/item-code.ts:10 (+ CodeReader type), item.ts, tests | N | M: code uniqueness under concurrency | Keep same code format. Keep tx so two creators cannot collide (retry on P2002). Enhancement; scope clear. |
| R2-329 | Back-dated production entry: parse date as factory-timezone midnight, not UTC | M | src/server/mis/production.ts:~442-447 (loggedAt), src/lib/mis/factory-timezone (check helpers), production.test.ts | N | M: shift attribution | Use the same IST helper as `workDateFor`. Test with 05:30 case. |
| R2-328 | editProductionLog: allow waste > produced (make-ready) like create does | S | src/server/mis/production.ts:~747 | N | L | Create path (L423-424) has no such rule. Remove the edit-only check, or apply a warning on both. Builder removes the check. |
| R2-327 | PRODUCTION_LOGGED close gate counts only logs with qtyProduced > 0 (sum > 0) | S | src/server/mis/orders.ts (computeCloseGates ~L188-217), src/lib/mis/order-transitions.ts | N | M: could block orders in existing tests | Keep allowing 0-qty logs (stoppage/make-ready only). Gate needs total produced > 0. 6B R2-264 already compares produced vs ordered; confirm the two do not conflict. |
| R2-295 | signOffPhase: require a non-empty handover note when any upstream phase is NOT_APPLICABLE | S | src/server/mis/job-phases.ts:~369-420, sign-off screen | N | L | Confirm status name NOT_APPLICABLE exists. |
| R2-290 | Traceability: group produced/waste by unit (byUnit), no cross-unit sum | M | src/server/mis/traceability.ts:59-68, trace screen/print, tests | N | M | Keep `totalProduced` only when one unit, else null. orders.ts already groups by unit (L217-219): reuse that helper. |
| R2-322 | getQcSummary: totalDefectQty excludes FAIL checks already resolved by a later PASS of the same stage+parameter | M | src/server/mis/qc.ts:~300, src/lib/mis/qc-verdict.ts | N | M | Reuse qc-verdict's "resolved" logic so it matches the order close gate (R2-319 normalisation). |

### C2 Permissions and roles (contract tests change)
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-340 | Worker submits own punch regularization (no attendance.write needed) | S | src/server/mis/punch-regularization.ts:75, src/server/mis/auth.ts (ownEmployeeId grant, L62-74) | N | M | PROBABLY FIXED (R2-252/6B): HEAD already calls `requirePermission('attendance.write', undefined, { ownEmployeeId })`. Verify WORKER passes via that grant with a test; if so log ALREADY_FIXED. |
| R2-341 | Regularization review gated on attendance.write, not clearance.write | S | src/server/mis/punch-regularization.ts:28 | N | L | PROBABLY FIXED: HEAD has `REVIEW_ACTION = 'attendance.write'`. Characterization test only. |
| R2-342 | Offline queue resolve: stop needing two permissions no single role has | M | src/server/mis/queue-resolve.ts:26 (queue.review), :58 (clearance.write), src/lib/mis/permissions.ts, queue-resolve.test.ts | N | M | UNCLEAR Q-342. CONTRACT pin edits. |
| R2-311 | QC role may acknowledge QC failures / deviation waivers | S | src/lib/mis/permissions.ts:159 (QC role list), src/server/mis/job-phases.ts:~711-745 | N | M: phase.write also gates other phase actions | UNCLEAR Q-311. Gotchas: phase.write does NOT let you sign off someone else's phase. CONTRACT pin. |
| R2-330 | Admin/Owner may sign off any job phase (audited, with reason) | M | src/server/mis/job-phases.ts:225 (isInCharge), :374-382, sign-off screen, job-phases.test.ts | N | M | UNCLEAR Q-330. |
| R2-331 | Admin may reopen a signed phase (mandatory reason) | S | src/lib/mis/permissions.ts:64-70,125 (phase.reopen), job-phases.ts:~605-612 | N | M | UNCLEAR Q-331. CONTRACT pin. |
| R2-332 | Supervisors/lead operators selectable in crew allocation | S | src/server/mis/worker-allocation.ts:36 (WORKABLE_ROLES), L103, L626, L850, L982 | N | M: pools in 5 queries | UNCLEAR Q-332. |
| R2-333 | Crew allocation for past shifts within the correction window | M | src/server/mis/worker-allocation.ts:121-126 assertDateInRange (callsite L202), correction-window helper | N | M | UNCLEAR Q-333. Reuse the 3-day correction window logic (`correction-window.test.ts`), roles above. |
| R2-310 | Acknowledge unstaged QC check (no bomStageId): in-charge of any active phase on the order, or Admin/Owner | S | src/server/mis/job-phases.ts:~730-745 | N | M | Intent clear from tester notes. Admin/Owner already allowed at L733. |

### C3 Line clearance, machine board, roster
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-308 | SHIFT-mode clearance with no shiftId still expires | M | src/server/mis/line-clearance.ts:98 (gate on latest.shiftId), L136 resolveShiftIdAt, tests | N | H: blocks production if wrong | UNCLEAR Q-308 (fallback duration). |
| R2-309 | JOB-mode clearance with null orderId must not clear every order | M | src/server/mis/line-clearance.ts:69-100 (assertLineCleared), L128-135 (currentOrderIdForMachine) | N | H | UNCLEAR Q-309. Same file as 308: do together. |
| R2-339 | Machine board: keep all concurrent bookings; late production entry extends, no duplicate booking | M | src/server/mis/machines-board.ts:79-81 (Map overwrite), src/server/mis/production.ts:~205 (NO_BOOKING auto-booking) | N | M | Tester-confirmed lines; verify duplicate-booking path in production.ts. |
| R2-337 | Shift roster: assigning a range that overlaps splits/replaces the old span | L | src/server/mis/shift-roster.ts:46-50, src/lib/mis/shift-roster.ts (rosterRangesOverlap), roster UI | N | M | UNCLEAR Q-337. |

### C4 CoA, job card, QC (print documents and quality)
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-284 | Job Card: show target quantity (with unit) and Customer PO # | S | src/app/(mis)/mis/print/job-card/[id]/page.tsx:~117-134, JobCardSnapshot, job-card-bpr.test.tsx | N | L | 6B added `orderQty/unit` and Customer PO (R2-264/265, migrations applied). Check whether the print already has them on HEAD; if not add. Snapshot readers must tolerate old frozen versions. |
| R2-294 | CoA without ?v= prints the latest APPROVED snapshot when one exists | M | src/app/(mis)/mis/print/coa/[id]/page.tsx:~40-54, src/lib/mis/document-snapshot.ts (docDataSource, parseVersionParam), coa-print.test.tsx | N | M | Related to 338 and 315/316 (same page). |
| R2-338 | CoA approval allowed before the order is COMPLETED/DELIVERED | S | src/server/mis/document-versions.ts:208-210 | N | M | UNCLEAR Q-338 (which status). |
| R2-315 | CoA summary: do not print historic fail counts beside PASS | M | CoA page.tsx:~59,160-165, document-snapshot.ts | N | M | UNCLEAR Q-315 (what to show). Uses 322's "resolved" logic. |
| R2-316 | CoA shows Batch/Lot No., Manufacturing Date, Quantity | M | CoA page.tsx:~101-122, CoaSnapshot in document-snapshot.ts | N | M | UNCLEAR Q-316 (where lot number comes from). |
| R2-312 | Night-shift checklist stays on one sheet: partition by factory shift date | M | src/lib/mis/qc-template.ts:~80-87 (filterChecksToFactoryDay), qc-checklist.tsx:33, print/qc-checklist/[id]/page.tsx:53 | N | M | Reuse `workDateFor` / shift-date logic from attendance-day.ts. If no shift is known, keep calendar day. |
| R2-317 | QC grid: unbooked IN_PRODUCTION orders are not "overdue" for every hour | M | src/server/mis/qc-grid.ts:~93-110, src/lib/mis/qc-grid.ts | N | M | Show them in a separate "not on a machine" state. |
| R2-320 | AQL sample dialog gets a process-stage selector | M | src/components/mis/qc/qc-detail-screen.tsx (stage state exists L82), actions.ts recordAqlSampleAction, qc.ts recordAqlSample | N | L | Enhancement; scope clear: optional stage, default order level. |
| R2-323 | Inactive checklist template: show archived template for existing checks | M | src/server/mis/qc-template.ts:58-65, qc-detail-screen.tsx:~79 | N | L | Warn on deactivate when open checks use it. |
| R2-314 | Separate Major and Minor AQL limits | L | src/lib/mis/aql.ts:166 (thresholdsFromPlan), L170 (AQL_LIMIT_KEY), business-rules.ts, settings QC screen, qc.ts | N | M | UNCLEAR Q-314. Enhancement; new rule rows are data, not schema. |

### C5 Store issue, return and receipt rules (server)
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-285 | Allocation arithmetic nets STORE_RETURN against issues | M | src/server/mis/order-allocation.ts:47-58 (allocationFigures), src/lib/mis/order-allocation.ts:41-55 (foldAllocationFigures), order-allocation.test.ts | N | M | Confirmed. Match returns to the same order+item. Do before 363. |
| R2-326 | Duplicate item lines in a cart are merged before the stock check | S | src/server/mis/store.ts:1032 (mergeCartLines), L1389/L1434 | N | M | PROBABLY FIXED: HEAD has `mergeCartLines` used by the commit path (L1139, L1389). Verify the check and ledger use merged qty; add test; log ALREADY_FIXED if so. Duplicate of 350. |
| R2-350 | Same as 326 (store issue screen) | S | same + item-cart.tsx (client: merge on add, L172) | N | M | DUPLICATE of 326. Client already increments the existing line at item-cart.tsx:172; verify. |
| R2-351 | Zero/negative issue qty refused | S | store.ts:1037 (`qty <= 0` throws), item-cart.tsx:225 (blankLines) | N | L | PROBABLY FIXED server and client. Verify negative and "1e5" paths; test. |
| R2-352 | Issue above the order's BOM allocation needs an override | M | store.ts:312, :1452 (allocationShortfalls), order-allocation.ts | N | M | PROBABLY FIXED in part (shortfall throws). UNCLEAR Q-352 whether an override exists and for whom. |
| R2-361 | Closed/cancelled orders: not offered in the issue screen | S | src/components/mis/store/issue-screen.tsx target list, store.ts:294 (server already refuses via isOrderClosed) | N | L | Server PROBABLY FIXED; client list filter to verify/add. Uses `isOrderClosed` from src/lib/mis/order-status.ts. |
| R2-363 | Return only what the order was issued (net of earlier returns) | M | src/server/mis/store.ts (return commit), src/app/(mis)/mis/store/returns, returns-screen.tsx, order-allocation.ts | N | M | UNCLEAR Q-363 (block or allow with reason). Depends on 285. |
| R2-364 | Issuing from a Material Request links materialRequestId and closes it | M | src/server/mis/store.ts:1004,1493,1537 (meta.materialRequestId exists), request-detail-screen.tsx, material-request.ts | N | M | Server accepts the id: verify the request detail "Issue" path passes it and request status becomes fulfilled. PROBABLY PARTLY FIXED. |
| R2-355 | General Use without Cost Center: client validation before submit | S | general-use-fields.tsx, issue-screen.tsx, store.ts:297 (categoryRefusal) | N | L | Make server refusal a friendly result, not a thrown error. Shares files with 347/348 (do the validation first). |
| R2-359 | Confirm Issue: disable on first click, idempotent key | S | item-cart.tsx:498 (canConfirm), store.ts:1074-1100 runOnce + meta.idempotencyKey | N | L | PROBABLY FIXED: cart commit takes an idempotency key (R3-STK B11). Verify client sends a stable key per cart and button has `busy`. Related to 291. |
| R2-357 | Stale balances: refresh/warn on window focus | M | item-cart.tsx:~238 (fresh balances at confirm), issue-screen.tsx | N | L | PROBABLY PARTLY FIXED (re-check at confirm). Add visible stale warning/refresh on focus only if missing. |
| R2-367 | Transaction notes never truncated | S | src/components/mis/store/store-transactions-screen.tsx, store.ts notes build | N | L | Find where notes are cut at 40-60 chars (grep `slice(`/`truncate`/CSS `truncate`). If CSS only, wrap text and show full on hover. |
| R2-291 | confirmGRN takes an idempotency key | M | src/server/mis/grn.ts:~527, src/app/(mis)/mis/grn/actions.ts:54, GRN detail screen, store.ts runOnce pattern, idempotency.ts | N | M | Same pattern as 359. Key column is free text. |
| R2-292 | adjustInventory, createStoreIn, createStoreOut accept an idempotency key | M | src/server/mis/inventory.ts:97, store.ts:185,276 | N | M | Optional key; old callers unchanged. |
| R2-336 | Soft-delete Item blocked with stock or in active BOMs; recreate handled | M | src/server/mis/item.ts:81-83,105-112 (deleteItem), prisma unique on code | N | M | UNCLEAR Q-336. Shares P2002 helper with 293. |

### C6 Store issue screen UI (after C5)
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-346 | Order picker: searchable combobox (order # or customer) | M | src/components/mis/store/issue-screen.tsx:104-120, src/components/ui/combobox.tsx | N | L | Enhancement, scope clear. A `Combobox` already exists in components/ui: reuse, do not add Radix Popover. Group 346/347/348/353/354. |
| R2-347 | Department picker: searchable combobox with clear | S | issue-screen.tsx:83-98 | N | L | Same as 346. |
| R2-348 | Cost Center: searchable combobox (code + label) | S | general-use-fields.tsx | N | L | Same as 346. |
| R2-349 | Cart as a table on desktop (cards on phone) | L | src/components/mis/store/item-cart.tsx | N | M: phone must not regress at 390 px | Columns: Code, Item, Available, Left on order, Issue Qty, UOM, remove. Do 366 sort after this. |
| R2-353 | Order combobox closes on "No order, General Use" | S | issue-screen.tsx / combobox.tsx | N | L | Folds into 346. |
| R2-354 | Combobox Esc and Tab keyboard behaviour | S | components/ui/combobox.tsx (+ test) | N | L | Folds into 346. |
| R2-356 | Barcode scan: Enter adds the exact-match item qty 1, refocus search | M | item-cart.tsx:~273 (search input), scan-button.tsx | N | L | Enhancement; scope clear: exact code/barcode match adds, otherwise show matches. |
| R2-358 | Supervisor on /mis/store/issue sees a "Raise Material Request" button | S | src/components/mis/store/raise-request-instead.tsx, issue page | N | L | Link to /mis/store/requests/new; fix the broken back link. |
| R2-360 | Quantity input rejects "e", "+", "-" and non-decimal text | S | item-cart.tsx:~410,427 (inputMode decimal) | N | L | Sanitise on change and keydown; also guard NaN in total. |
| R2-362 | "Clear cart" button with confirm | S | item-cart.tsx, components/ui/confirm-dialog.tsx | N | L | Enhancement, scope clear. |
| R2-366 | Sort cart rows by item name, balance | S | item-cart.tsx | N | L | Enhancement; after 349. |
| R2-368 | Quantity "+" does not lose focus on phones | S | item-cart.tsx:~197 (delta handler) | N | L | Stable row keys; do not remount rows. |

### C7 Attendance classic screen
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-369 | Edit modal pre-fills Clock Out with the assigned shift end time | M | src/components/mis/attendance/attendance-screen.tsx:131,276 (editOut), toTimeInput | N | M: auto-filled value becomes a real punch | UNCLEAR Q-369. Duplicate group 369/370/371/373 (+372). |
| R2-370 | Clock Out follows Clock In + shift duration while editing | M | attendance-screen.tsx | N | M | DUPLICATE group with 369. Uses same wrap helper as 372. |
| R2-371 | Bulk Clock Out defaults Time to selected shift end time | S | attendance-screen.tsx:85,96,290 | N | M | DUPLICATE group with 369. |
| R2-372 | Night-shift end time wraps past midnight (minutes mod 1440) | S | a small shared time helper in src/lib/mis/ (reuse attendance-day.ts workDateFor math) | N | M | Build first; 369-371 and 373 use it. Gotchas: workDateFor and WorkDate.kt must stay formula-identical, so do NOT change workDateFor, add a new helper. |
| R2-373 | "Standard shift" one-click fill (shift in + out) on a past date | M | attendance-screen.tsx (bulk punch slide-over) | N | M | Enhancement. UNCLEAR Q-369 covers it. |

### C8 Money rows
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-324 | Bank transfer CSV exports net pay after deductions | L | src/server/mis/payroll-ledger.ts:21-39,78-95, payroll.ts, payroll-bank-transfer.test.ts, payroll-screen.tsx | N | H: money + compliance | UNCLEAR Q-324. Verify first whether deduction fields exist in payroll today. Audit payload must stay figure-free. |
| R2-325 | GST-inclusive invoice should not flag a price discrepancy | L | src/lib/mis/invoice-match.ts:83-90, src/server/mis/supplier-invoice.ts, invoice form | Y (optional tax amount / GST % on invoice) | H | UNCLEAR Q-325. Do 335 first (C1). |

### C9 Schema batch (last; one pending migration per row)
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-286 | Material request partial approval keeps balance open | L | src/server/mis/material-request.ts:158-185, prisma MisMaterialRequest status enum, request screens | Y (enum value, additive) | H | UNCLEAR Q-286. |
| R2-287 | Pick list staging reserves stock until handover/cancel | L | src/server/mis/pick-list.ts:68-115, store.ts:~1430-1450 | N (compute available = ledger balance - staged qty) or Y if a table is wanted | H | UNCLEAR Q-287. |
| R2-365 | Same as 287 (issue screen sees the reserved quantity) | S | store.ts available-balance helper, issue-screen | N | H | DUPLICATE of 287: fix once, issue screen balance subtracts staged quantity. |
| R2-288 | Supplier invoice payment states (APPROVED_FOR_PAYMENT, PAID, REJECTED) + payment ref/date | L | prisma enum MisSupplierInvoiceStatus (schema.prisma ~1989-1995), supplier-invoice.ts:140-187, invoice screen | Y | M | UNCLEAR Q-288. Audit payload: no amounts. |
| R2-318 | QC check records the machine; defect report attributes by it | L | prisma MisQcCheck (+machineId), qc.ts, defects.ts / src/lib/mis/defects.ts:67-72, qc-detail-screen.tsx | Y (nullable column) | M | Old rows keep the time-based attribution fallback. |
| R2-334 | Batch/lot numbers in traceability | L | prisma (GRN line lot, ledger/issue lot), traceability.ts:130-150, grn.ts, store.ts | Y | H | UNCLEAR Q-334 (scope). |
| R2-345 | Dispatch: partial dispatch, delivery challan, vehicle, e-way bill number | L | new model + server + screens, order-transitions.ts:11-31, orders.ts | Y | H | UNCLEAR Q-345 (scope). |

## 2. Counts
- Size: S 36, M 31, L 11 (78 rows).
- needs-schema Y: 325, 286, 288, 318, 334, 345 (plus 287 maybe).
- UNCLEAR rows (stop for answer): 28 rows incl. 365, 370, 371 which inherit Q-287 and Q-369 (342, 311, 330, 331, 332, 333, 308, 309, 337, 338, 315, 316, 314, 352, 363, 336, 369, 373, 324, 325, 286, 287, 288, 334, 345) under 24 questions in section 3.
- Possibly already fixed / verify first (PROBABLY FIXED): 340, 341, 326, 350, 351, 352 (part), 359, 357 (part), 361 (server), 364 (part), 284 (check 6B print).
- Duplicates (fix once): 326=350, 287=365, 369=370=371 (+373, 372 shares helper), 346/347/348 with 353/354, 294~338 (same page), 315~316 (same page), 285~363, 291~359 (same idempotency pattern), 293~313~336 (same P2002 helper), 335~325 (same module), 308~309 (same file).
- Status: all rows are "New Bug" with tester result Fail; Enhancements: 314, 320, 344, 346, 347, 348, 349, 353, 354, 356, 362, 366, 369, 370, 371, 373.

## 3. UNCLEAR questions (never guess; owner answers in R2_ROUND6C_DECISIONS.md)
- Q-286: When a Material Request is only partly issued, should the rest stay open as a "Partially issued" request (store can issue the balance later), or close with a note? 
- Q-287/365: Should staging a pick list hold the stock (so nobody else can issue it) until it is handed over or cancelled?
- Q-288: Which supplier invoice states do we want (Approved for payment, Paid, Rejected), who may set them, and what payment details are recorded (date, UTR/cheque no.)?
- Q-308: A SHIFT line clearance made outside a shift: how long should it last? 
- Q-309: JOB line clearance when no order is booked on the machine yet: refuse it, or let it count only for the next order that starts?
- Q-311: Should the QC role be allowed to acknowledge QC failures and waivers (without being allowed to sign off other phases)?
- Q-314: Should Major and Minor defects have separate acceptable-quality limits in Settings (two numbers), and what starting values?
- Q-315: What should the CoA summary show: only failures never resolved, or also the earlier failed-then-passed checks?
- Q-316: Where does the CoA Batch/Lot number and Manufacturing Date come from?
- Q-324: Does the factory deduct PF, ESIC, PT and advances from pay today, and should the bank transfer file show net pay after them?
- Q-325: How should GST be handled in invoice matching (compare ex-GST amount, or enter GST % and compare with tax)?
- Q-330: May Admin and Owner sign off a job phase directly without being its in-charge?
- Q-331: May Admin reopen a signed job phase (with a reason), or keep that Owner-only?
- Q-332: May Supervisors be booked as crew on machines?
- Q-333: May crew be booked for past shifts, and how far back and by whom?
- Q-334: How far should lot tracking go this round: lot number on goods receipt and shown in traceability only, or on every stock issue?
- Q-336: Item delete: block when stock balance is above zero or the item is in an approved BOM, and if the code is re-used after delete, restore the old item?
- Q-337: Shift roster overlap: automatically cut the old entry at the new start date and keep earlier history?
- Q-338: From which order status may a CoA be approved?
- Q-342: Which role should resolve parked offline-queue entries?
- Q-345: How much dispatch for this round (see default), or defer to its own project?
- Q-352: When an issue goes above the order's allocated quantity, may a Supervisor/Owner override with a reason, or block for everyone?
- Q-363: Return of material never issued to that order: block for everyone, or allow with a reason by Owner?
- Q-369/370/371/373: Should the end time be pre-filled with the shift end (counts as a real punch if saved), only when empty, and should one-click "standard shift" exist?

## 4. Acceptance per batch (every batch, before logging GATE_PASSED)
1. `pnpm typecheck` clean (run `pnpm db:generate` first if the Prisma client is stale).
2. `pnpm lint` 0 errors.
3. Full `pnpm test` (vitest) green, whole suite, not just touched files.
4. Each fixed row has a new or updated test that fails before the fix and passes after, with a `// R2-nnn` comment.
5. Never edit a test just to make it pass. The only allowed edits are contract-pin updates named in AGENT_GOTCHAS (navigation EXPECTED, never-leak list, audit-payloads money-key list, permission-matrix, server-gates, r3-sec-*, rule-history `it.fails` flips), each with a `// R2-nnn` comment and logged as CONTRACT; never delete an assertion.
6. No migrations applied (write only; list them in MAX_LOG for the owner). Schema rows follow the Schema protocol above.
7. No tester-sheet writes (the PRO Mac updates the sheet after deploy; never mark Pass).
8. Commits go to `fix/r2-round6c` only, never merge to `main`.
9. Production build green at end of the last batch.
10. Money safety: no wage/rate figures in audit payloads or non-Owner payloads; run `mis-permission-matrix` for 311, 330, 331, 332, 342, 340/341, 324, 325, 288.
11. UI rows (C4, C6, C7): check at 390 px and 1280 px.

## 5. PROGRESS checklist (tick = DEV_DONE + gate green, else write state)
Batch C1
- [ ] R2-289 supplier delete vs RECEIVING PO
- [ ] R2-293 duplicate customer/supplier code
- [ ] R2-313 soft-deleted defect type code
- [ ] R2-335 invoice number match trim/case
- [ ] R2-319 close-gate parameter case
- [ ] R2-321 AQL revalidate grid
- [ ] R2-343 wastage % formula
- [ ] R2-344 item code allocation (Enhancement)
- [ ] R2-329 back-dated production timezone
- [ ] R2-328 edit production waste > produced
- [ ] R2-327 zero-qty satisfies close gate
- [ ] R2-295 sign-off note when upstream NOT_APPLICABLE
- [ ] R2-290 traceability units
- [ ] R2-322 QC summary defect totals
Batch C2
- [ ] R2-340 worker regularization (verify)
- [ ] R2-341 regularization review permission (verify)
- [ ] R2-342 offline queue resolve (needs Q)
- [ ] R2-311 QC role phase.write (needs Q)
- [ ] R2-330 Admin/Owner phase sign-off (needs Q)
- [ ] R2-331 Admin reopen phase (needs Q)
- [ ] R2-332 supervisors in crew (needs Q)
- [ ] R2-333 past-shift crew booking (needs Q)
- [ ] R2-310 unstaged QC acknowledgement
Batch C3
- [ ] R2-308 SHIFT clearance expiry (needs Q)
- [ ] R2-309 JOB clearance null order (needs Q)
- [ ] R2-339 machine board concurrent bookings
- [ ] R2-337 roster range splitting (needs Q)
Batch C4
- [ ] R2-284 job card qty + PO
- [ ] R2-294 CoA defaults to approved snapshot
- [ ] R2-338 CoA approval before completion (needs Q)
- [ ] R2-315 CoA fail counts (needs Q)
- [ ] R2-316 CoA batch/lot/mfg date (needs Q)
- [ ] R2-312 night-shift checklist
- [ ] R2-317 QC grid unbooked orders
- [ ] R2-320 AQL stage selector (Enhancement)
- [ ] R2-323 archived checklist template
- [ ] R2-314 Major/Minor AQL (needs Q, Enhancement)
Batch C5
- [ ] R2-285 returns restore allocation
- [ ] R2-326 duplicate cart lines (verify)
- [ ] R2-350 (dup of 326)
- [ ] R2-351 zero/negative qty (verify)
- [ ] R2-352 over-allocation override (needs Q)
- [ ] R2-361 closed orders in issue list
- [ ] R2-363 return not issued (needs Q)
- [ ] R2-364 request link on issue
- [ ] R2-355 General Use needs cost center
- [ ] R2-359 double-click issue (verify)
- [ ] R2-357 stale balance
- [ ] R2-367 notes truncation
- [ ] R2-291 confirmGRN idempotency
- [ ] R2-292 adjust/in/out idempotency
- [ ] R2-336 item delete guards (needs Q)
Batch C6
- [ ] R2-346 order combobox (Enhancement)
- [ ] R2-347 department combobox (Enhancement)
- [ ] R2-348 cost center combobox (Enhancement)
- [ ] R2-349 cart as table (Enhancement)
- [ ] R2-353 popover closes (Enhancement)
- [ ] R2-354 keyboard Esc/Tab (Enhancement)
- [ ] R2-356 barcode Enter (Enhancement)
- [ ] R2-358 supervisor dead end
- [ ] R2-360 scientific notation input
- [ ] R2-362 clear cart (Enhancement)
- [ ] R2-366 sort rows (Enhancement)
- [ ] R2-368 focus after plus
Batch C7
- [ ] R2-372 night-shift wrap helper
- [ ] R2-369 edit Clock Out prefill (needs Q, Enhancement)
- [ ] R2-370 Clock Out follows Clock In (needs Q, Enhancement)
- [ ] R2-371 bulk Clock Out default (needs Q, Enhancement)
- [ ] R2-373 standard shift fill (needs Q, Enhancement)
Batch C8
- [ ] R2-324 bank transfer net pay (needs Q)
- [ ] R2-325 GST in invoice match (needs Q, SCHEMA)
Batch C9
- [ ] R2-286 partial material request (needs Q, SCHEMA)
- [ ] R2-287 pick list reservation (needs Q)
- [ ] R2-365 (dup of 287)
- [ ] R2-288 invoice payment states (needs Q, SCHEMA)
- [ ] R2-318 QC check machine (SCHEMA)
- [ ] R2-334 batch/lot traceability (needs Q, SCHEMA)
- [ ] R2-345 dispatch (needs Q, SCHEMA)

## Final step (after C9)
- [ ] FINAL: ask the owner to apply pending migrations (Schema protocol, step 4) and WAIT for "migrations applied" (the owner applies them from another clone, so the builder cannot do or verify it; it must still stop here), then re-run typecheck + lint + full vitest, push, report "ready to deploy".
