# R2 Round 6B: work plan for tester bugs R2-234 to R2-283 (50 rows, none skipped)

> **All UNCLEAR rows are resolved** — see `docs/qa/R2_ROUND6B_DECISIONS.md` (owner-approved). Implement those decisions as written; do not re-ask.

> **Schema protocol for this round (overrides the "stop after Half A" step of `mis-schema-gate`; owner-approved).** Do NOT stop at schema rows. This Mac can run `pnpm db:generate` (no database needed), so:
> 1. Edit `prisma/schema.prisma`, hand-write additive SQL in `prisma/migrations-pending/<ts>_<name>/migration.sql` (nullable or defaulted columns only, rollback comment block), run `pnpm db:generate`, then do Half B (server code, UI, tests with mocked db) in the same pass.
> 2. NEVER run `pnpm db:deploy`, `db:migrate`, or `mv` a folder into `prisma/migrations/`, and never touch the live database.
> 3. Keep every migration additive so the currently deployed code keeps working before and after it is applied.
> 4. After the LAST batch passes all gates, STOP and send the owner one message: "All batches verified. Apply migrations before I merge:" with the list of pending folders and the exact command `mv prisma/migrations-pending/<folder> prisma/migrations/` for each, then `pnpm db:deploy && pnpm db:generate`. Wait for the owner to say the migrations are applied.
> 5. After that, re-run `tsc`, `eslint`, full `vitest` once more, push, and report "ready to deploy". The owner deploys to `main` from the other Mac; do not merge or push to `main`.
> The only reason to stop earlier is a row marked BLOCKED in `PROGRESS.md`.


Bug text (verbatim, the only source for the Mac with no sheet access): `docs/qa/R2_ROUND6B_BUGS.md`.
Earlier plan for 234-263: `docs/qa/R2_ROUND6_COORDINATION.md` (F1-F17 fix map, D1-D4 decisions). Reuse its roles, states and log files (`docs/qa/round6/MAX_LOG.md`, `PRO_LOG.md`, append-only, line `ID | STATE | sha | note`).
Format reference: `docs/qa/R2_ROUND5_TRIAGE.md`. Tester build `7633928`. Sheet `1dZbhlD4uEtJ8amGx_v-p6MTuKCxoJfqqG2Mq7eqnAtM`, tab Bugs, rows 228-277.

## 0. Read first
- Triage each row against HEAD before coding (what did the code at HEAD actually do). If already fixed, log ALREADY_FIXED with sha + test, add a characterization test only.
- WARNING: `docs/AGENT_GOTCHAS.md` describes R2-235, 241, 252, 253, 256, 259 as already done. Spot-check of source at planning time shows they are NOT in the code: `REVIEW_ACTION` is still `clearance.write` (punch-regularization.ts:28), `operatorRoleOf` returns null for ADMIN/OWNER (kiosk-device.ts:638), `workDateFor` has no OT grace (attendance-day.ts:82), business-rules.ts update path still `create`s a row with no same-day check, `navigation.ts:97` still allows desktop `me` for WORKER only. Treat those docs lines as the target state (probably copied from another branch or written ahead). Confirm on HEAD; if code is missing, implement it. Schema `correctionsAfterClose` (schema.prisma:1715) and `ATTENDANCE_LUNCH_BREAK_MINUTES` already exist.
- Repo has no `R2-2xx` code comments for 234-263 yet, so nothing is traceably fixed by a prior round. R2-210..233 work is tagged only partly: `late-rule.ts` is R2-230, `/mis/me` desktop grid is R2-221, `cancelLeaveRequest` (attendance.ts:806) exists from R2-168.
- Never guess UNCLEAR rows: stop, log `BLOCKED_DECISION`, move to the next row.

Status key in the table: UNCLEAR = needs owner/product answer (question in section 3). SCHEMA = needs-schema Y, follow `mis-schema-gate` Half A (agent: edit schema.prisma + write migration SQL, never apply, never promote, STOP) then Half B (human Mac: `pnpm db:generate`, apply, promote). Do not merge or deploy code that reads a new column before the human has applied the migration.

## 1. Batches (ordered)

Order rule: server blockers first, then Android (shares WorkDate parity with B1), payroll, settings, nav/UX, then the schema-heavy orders/BOM/PO/GRN/store rows last so non-schema fixes ship early. Within B7-B9 do non-schema rows first, schema rows last, one migration per batch.

### B1 Attendance and kiosk server (blockers)
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-234 | Kiosk pull: resolve default shift / roster for unallocated workers so `shift` is not null | M | src/server/mis/kiosk-device.ts (~L696-728 select + shiftOf), src/server/mis/shift-roster.ts (resolveEmployeeShiftId), kiosk-device.test.ts | N | M: payload shape feeds Android | Duplicate root cause with R2-247 (fix once). HEAD still builds shiftOf only from attendance + allocations. |
| R2-247 | Same fix as 234 (gate kiosk roster) | S | same as 234 | N | M | DUPLICATE of 234; mark both in log; Bug Reproduced = tester re-confirmed it fails. |
| R2-235 | Night shift OT clock-out is not stale: workDateFor OT grace = max(end, start+16h-24h) | L | src/lib/mis/attendance-day.ts (~L82), src/server/mis/attendance-payroll-rules.ts (~L114-120), src/server/mis/attendance-punch.ts (isStaleOpenIn), attendance-day.test.ts | N | H: payroll-affecting, must keep R2-52/R2-213 stale-IN behaviour | Android WorkDate.kt must match (see B2). Gotchas pin the formula. |
| R2-246 | Same fix as 235 (server workDateFor + Android WorkDate.kt) | S (server) | as 235 + mis-kiosk-android/.../data/time/WorkDate.kt | N | H | DUPLICATE of 235. Android half goes in B2. |
| R2-248 | Resolve parked TOO_OLD punch from /mis/queue: bypass correction window with mandatory note + audit | M | src/server/mis/queue-resolve.ts (~L60-75, TOO_OLD sets skipTiming only), attendance-punch.ts:279, idempotency.ts | N | M | HEAD: TOO_OLD sets `skipEmployeeChecks:false`, so window check still fires; set it true for TOO_OLD. Keep note mandatory. |
| R2-251 | bulkPunch IN must resolve and store shiftId like clockIn | S | src/server/mis/attendance.ts (~L485-495, create/update have no shiftId; clockIn L254 is the model) | N | M: OT/late calcs | Verify HEAD: only OUT stores shiftId. |
| R2-253 | ADMIN/OWNER can sign in as kiosk operator: map to SUPER_OPERATOR | S | src/server/mis/kiosk-device.ts (~L638 operatorRoleOf), kiosk-device.test.ts; Android PunchViewModel.kt (~L298) needs NO change if mapped to SUPER_OPERATOR | N | M: widens who can punch | Gotchas already state mapping decision. |
| R2-252 | Regularization review needs `attendance.write` not `clearance.write` | S | src/server/mis/punch-regularization.ts (L28 REVIEW_ACTION; also L114/119 usage), permission-matrix.test.ts, server-gates.test.ts | N | M: permission change | CONTRACT update in permission tests with `// R2-252` comment, log as CONTRACT. Run mis-permission-matrix skill. |
| R2-244 | Daily register: Clock In on unrecorded rows for past dates within correction window | S | src/components/mis/attendance/attendance-screen.tsx (L175-176), attendance.ts | N | L | POSSIBLY ALREADY FIXED: L176 renders a past-date Clock In when `r.employee` exists (R2-165). Reproduce for `new:<empId>` rows first. Status Bug Reproduced = tester confirms still failing on 7633928. |

### B2 Android kiosk
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-246 (Android half) | WorkDate.kt same OT-grace formula as server | M | mis-kiosk-android/app/src/main/java/com/example/mis_kiosk/data/time/WorkDate.kt + its unit test | N | H | Do after R2-235 server so both stay formula-identical (golden test table shared by values). |
| R2-243 | Offline queue: dismiss REJECTED/PARKED entries with confirm | M | mis-kiosk-android/.../ui/queue/QueueScreen.kt (L34-43 says "Nothing here can be dismissed"), data/repository/PunchRepository.kt (dismiss(key)), QueueViewModel | N | M | Android release build is the gate. DUPLICATE of 254. |
| R2-254 | Same as 243 | S | same | N | M | DUPLICATE of 243. Severity Minor. |

Android gate: `JAVA_HOME=~/android-tools/jdk/Contents/Home ./gradlew --no-daemon :app:testDebugUnitTest :app:assembleRelease` (see AGENT_GOTCHAS). Copy APK to `release/`, delete `app/build` after.

### B3 Payroll
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-236 | DAILY worker with sundayPaid=true gets paid weekly off (keep sandwich + attendance.weekly_off policy) | M | src/server/mis/payroll.ts (L168 weeklyOffPaidOn requires MONTHLY; emp.sundayPaid already typed at L55), payroll-policy-rules.test.ts, payroll-figures.test.ts | N | H: money | DUPLICATE of 245. Wage amounts never in audit payloads. |
| R2-245 | Same root cause as 236 (Sunday fraction zeroed for DAILY) | S | same | N | H | DUPLICATE of 236, severity Blocker. Test must assert exact `Math.round` rupees. |
| R2-256 | Attendance edit in a closed month: Owner sees a clear message/banner; no silent drift (do not auto-recalc snapshot) | M | src/server/mis/attendance.ts, src/server/mis/payroll-period.ts, payroll-screen.tsx (drift banner), prisma `correctionsAfterClose` (already in schema L1715) | N (column exists) | H | UNCLEAR-linked: Decision D3 (coordination plan) recommends block + "Reopen month" prompt; gotchas say Owner may edit with reason and bump `correctionsAfterClose` + banner. Contradictory, see Q-256. |
| R2-257 | Add Half-Day column to payroll overview table | S | src/components/mis/payroll/payroll-screen.tsx (CSV header at L84 already has Half-Day; table does not) | N | L | Part of the same layout change as 237/258. |
| R2-237 | Payroll desktop layout: wide container, export actions in side card | M | payroll-screen.tsx (L418 `max-w-2xl`) | N | L: phone must not regress (390 px) | DUPLICATE group 237/258 (+257). UI/UX Defect. |
| R2-258 | Same container fix (cosmetic) | S | same | N | L | DUPLICATE of 237. |

### B4 Settings and business rules
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-259 | Saving the same rule twice in one day updates today's row instead of P2002 | S | src/server/mis/business-rules.ts (update path ~L262-290; mirror `addWageRate` / wage-type.ts R2-161), rule-history.test.ts | N | M: append-only revision semantics | Unique key `(ruleKey, effectiveFrom DATE)`; effectiveFrom is `new Date()` timestamp vs DATE: check which collides. |
| R2-241 | Hide orphan keys shift.start_time / shift.end_time in Settings (do not delete rows) | S | src/server/mis/business-rules.ts (list), src/components/mis/settings/settings-screen.tsx | N | L | Rows must stay in DB. |
| R2-242 | Late-rule setting: enum ALL/DAILY/MONTHLY, validate on save, fix description text | M | src/lib/mis/late-rule.ts (parse already tolerant, R2-230), business-rules.ts (assertRuleValueValid), settings-screen.tsx | N | M | DUPLICATE of 260. Tester says description mentions deduct_ot/absent that code never reads. |
| R2-260 | Same: unrecognized values must not silently become ALL | S | same | N | L | DUPLICATE of 242. |

### B5 Self-service, nav, leave, roles
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-238 | /mis/me for user with no employee link: clear "account not linked, ask admin" card; do not auto-link | S | src/app/(mis)/mis/me/page.tsx (employee null renders name/code fallback, no message) | N | L | DUPLICATE of 249. |
| R2-249 | Same, worker phone portal blank card | S | me/page.tsx, src/server/mis/roles.ts (getMisEmployee) | N | L | DUPLICATE of 238. Bug Reproduced. |
| R2-239 | Desktop sidebar shows Me for all roles that have an employee profile | S | src/server/mis/navigation.ts (L76 phoneOnly, L97 WORKER-only), navigation.test.ts EXPECTED, navigation-more.test.ts | N | M: contract tests | CONTRACT update with `// R2-239` comment. DUPLICATE of 255. |
| R2-255 | Same as 239 | S | same | N | M | DUPLICATE of 239. |
| R2-240 | Cancel approved FUTURE leave by worker or Admin with audit reason | M | src/server/mis/attendance.ts (cancelLeaveRequest L806 exists, Owner-gated?), leave screens under src/components/mis/me and attendance, approvals | N | M | UNCLEAR (Q-240/261, decision D1). Status Open. |
| R2-261 | Admin/worker revoke approved leave | S | same as 240 | N | M | Deferred + tester Blocked "intended by design". UNCLEAR, same decision as 240. Implies: no code unless owner says yes; else log BY_DESIGN. |
| R2-250 | Admin onboarding a MONTHLY/wage-code employee gets friendly message instead of raw MisForbiddenError('wages.read') | S | src/server/mis/employee.ts, employees form component, friendly error mapping (action-result.ts) | N | L | UNCLEAR (Q-250, D2): coordination recommends keep rule + friendly message + default pay type. |
| R2-262 | Attendance Operator/Supervisor stay 3-day correction window | S | none | N | L | Status Deferred, tester result PASS (by design). No code. Log BY_DESIGN; add a characterization test only if missing (correction-window.test.ts). |
| R2-263 | Supervisor assign/modify rotational shift rosters | L | src/server/mis/shift-roster.ts, roles.ts permission matrix, shift roster UI | Maybe (new permission is data only; N unless new column) | M | Enhancement Requested + tester Blocked. UNCLEAR (Q-263, D4 recommends stay Deferred). Implies: no work this round unless the owner approves a new permission. |

### B6 Orders and BOM
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-266 | Reopen order: warn that reservations/machine bookings were cleared (and/or re-reserve) | M | src/server/mis/orders.ts (reopenOrder L365; close paths ~L289-309), order-allocation.ts, allocation-release.ts, order-status-actions.tsx | N | H | UNCLEAR (Q-266: warn only vs auto re-reserve). |
| R2-267 | Start production requires an APPROVED BOM | S | src/server/mis/orders.ts (~L225), src/lib/mis/order-transitions.ts (L26-33), order-status-actions.tsx | N | H: could block existing flows/tests (r3-ord-*) | UNCLEAR (Q-267: hard block or owner override?). |
| R2-269 | BOM material with no catalogue item: block/warn before approval | M | src/server/mis/bom.ts (~L304 itemId optional, assertBomComplete L326), po.ts L363, bom-screen.tsx | N | M | UNCLEAR (Q-269). Existing r2-bom-item-link.test.ts. |
| R2-270 | assertBomComplete checks every stage (group by stageId) | S | src/server/mis/bom.ts (L326-335), bom-lifecycle.test.ts | N | M | UNCLEAR (Q-270: what makes a stage valid, materials only or process spec too). |
| R2-271 | BOM overview: show floor/unpriced marker next to subtotal | S | src/server/mis/bom.ts (BomOverviewRow, `isFloor` at L87/126 exists on roll-up), bom-desktop.ts, bom list screen | N | L | Type Enhancement. isFloor already computed upstream; may be partly done in desktop view, check first. |
| R2-282 | STORE_GUY can read the approved BOM material list without prices | M | src/server/mis/navigation.ts, bom-screen.tsx, src/app/(mis)/mis/bom, bom.ts reads (money stripped), permission-matrix.test.ts, wage-leak.test.ts | N | H: money leak risk | UNCLEAR (Q-282). Must run mis-permission-matrix skill; no rates/costs for this role. |
| R2-264 | Order target quantity + UOM (new fields, create/edit form, list, gate data) | L | prisma/schema.prisma (MisOrder L844), src/server/mis/orders.ts, src/lib/mis/order-transitions.ts (L18-22 comment), orders-screen.tsx, order-detail-screen.tsx | **Y SCHEMA** | H | UNCLEAR (Q-264). Prerequisite for 268. Optional-nullable columns keep old orders valid. Blocker, status New Bug. |
| R2-268 | BOM material rate basis (per unit vs batch) so requests scale with order qty | L | prisma/schema.prisma (MisBomMaterial L999), src/server/mis/bom.ts (L297-320), material-request.ts, bom-costing.ts | **Y SCHEMA** | H | UNCLEAR (Q-268). Depends on 264. Existing BOMs must default to "batch total" (no behaviour change). |
| R2-265 | Customer PO # field, searchable, printed on Job Card and Delivery Challan | M | prisma/schema.prisma (MisOrder), src/server/mis/orders.ts (L45-56 + search), search.ts, print routes, orders-screen.tsx | **Y SCHEMA** | M | UNCLEAR (Q-265). Type Enhancement shown as Bug. |

### B7 Purchase orders
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-275 | PO cancel ignores DRAFT GRNs (discard them or warn) | S | src/server/mis/po.ts (cancelPO ~L432), grn.ts discardGRN | N | M | UNCLEAR (Q-275: auto-discard drafts or just ignore). |
| R2-276 | PO line unit must match item catalog unit | S | src/server/mis/po.ts (~L284-294) | N | M: stock ledger integrity | UNCLEAR (Q-276: reject or convert). |
| R2-274 | Warn/block duplicate PO for same BOM material | M | src/server/mis/po.ts (createPO ~L240-272) | N | M | UNCLEAR (Q-274: warn vs block, cumulative tolerance). |
| R2-273 | Non-Owner PO rates: Admin quote rates must not force BOTH approval or trap the Owner | L | src/server/mis/po.ts (L280-282, 373, 415-416), po-detail-screen.tsx, wage-leak.test.ts, audit-payloads.test.ts | N | **H: D5/D24 purchase rates are Owner money (`wages.read`)** | UNCLEAR (Q-273). Direct conflict with the decided money-visibility rule; never guess. |
| R2-272 | PO deliveryDueDate + paymentTerms, shown on print PO | M | prisma/schema.prisma (MisPurchaseOrder), po.ts (L248-262), print/po route, po-detail-screen.tsx | **Y SCHEMA** | M | UNCLEAR (Q-272 payment-terms format). |

### B8 GRN and supplier invoices
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-279 | Hard ceiling on over-receipt override | M | src/server/mis/grn.ts (L138-157), src/lib/mis/receipt-rules.ts (L60-80), grn-detail-screen.tsx | N | M | UNCLEAR (Q-279: ceiling % or value, who signs). |
| R2-280 | DISCREPANCY invoice needs variance sign-off before payment | M | src/server/mis/supplier-invoice.ts (L80-140), src/lib/mis/invoice-match.ts, supplier-invoices screen | Maybe Y (sign-off who/when/reason columns; could reuse audit only) | M | UNCLEAR (Q-280). If a column is needed, treat as SCHEMA. |
| R2-278 | Damaged qty on confirmed GRN booked to a quarantine/damaged location | L | src/server/mis/grn.ts (confirmGRN ~L623-630), store-books.ts, inventory.ts, stock-lock.ts | Likely **Y SCHEMA** (location/ledger kind) | H: ledger integrity | UNCLEAR (Q-278). Existing r2-store-grn / grn-integrity tests pin behaviour. |
| R2-277 | Reverse/void a confirmed GRN (credit ledger, reopen PO outstanding, update invoice) | L | src/server/mis/grn.ts (discardGRN L430-450), store.ts, po.ts status, supplier-invoice.ts | **Y SCHEMA** (VOID/REVERSED status; R2-158 document VOID migration is the precedent) | **H** | UNCLEAR (Q-277). Do last in batch. |

### B9 Store
| ID | Fix intent | Size | Likely files | Schema | Risk | Flags |
|---|---|---|---|---|---|---|
| R2-281 | Idempotency key on receipt and issue cart commits | M | src/server/mis/store.ts (commitReceipt ~L1130-1250, commitIssue ~L1383-1490; `runIdempotent` in idempotency.ts is imported at L9, `idempotencyKey` seen at L994), receive-screen.tsx, issue-screen.tsx | N | M | POSSIBLY PARTLY FIXED: some store paths already take an idempotencyKey. Verify these two commits specifically. |
| R2-283 | Reconcile recalculates against live balance (or blocks if stock moved since count) | M | src/server/mis/store.ts (reconcilePhysicalCount ~L625-670, count stores `discrepancy` L550), store-count-screen.tsx | N | H: inventory | UNCLEAR (Q-283: recompute vs block). |

Row count check: every ID 234-283 appears in the checklist (246 twice: server and Android halves).

## 2. Counts
- Size: S 24, M 19, L 7 (each ID once; 246 counted as M for its Android half).
- needs-schema: Y = 264, 265, 268, 272, 277 (+ likely 278, maybe 280). 263 only if a new column is wanted.
- UNCLEAR (stop for answer): 240, 261, 250, 256, 263, 264, 265, 266, 267, 268, 269, 270, 272, 273, 274, 275, 276, 277, 278, 279, 280, 282, 283 = 23.
- Possibly already fixed / verify first: 244 (R2-165), 240 (cancelLeaveRequest exists), 281, 271, 242/260 (late-rule parsing R2-230), 257 (Half-Day in CSV), plus gotchas-listed 235/241/252/253/256/259 (documented done, code not).
- Duplicates (fix once): 234=247, 235=246, 236=245, 237=258(+257 layout), 238=249, 239=255, 240~261, 242=260, 243=254.
- Status implications: "Bug Reproduced" (244-260) = tester re-ran on 7633928 and still fails, treat as confirmed bugs, not new. "Deferred" 261/262 and "Enhancement Requested" 263 = tester already marked Blocked/Pass/by design: no code without an owner answer; still log a state for each (BY_DESIGN or BLOCKED_DECISION). "New Bug" 264-283 are fresh and tester comments say "Confirmed in <file:line>", useful but re-verify against HEAD.

## 3. UNCLEAR questions (never guess)
- Q-240/261: May a worker or Admin cancel an approved leave while its start date is still in the future (audit reason)? Recommendation D1: yes. Owner-only afterwards.
- Q-250: Should Admin be able to pick pay type / wage code at onboarding, or keep the rule that only Owner can (and just show a friendly message)? Recommendation D2: keep, friendly message.
- Q-256: Attendance edit in a closed payroll month: block with "Reopen month" prompt (D3) or let the Owner edit with a reason and show a drift banner (gotchas)?
- Q-263: Should Supervisors get shift-roster permission this round? Recommendation D4: stay Deferred.
- Q-264: Should order quantity be mandatory? Which units (Boxes, Reams, Pcs, others)? Should production complete only when produced >= ordered?
- Q-265: Customer PO number mandatory or optional, and which prints carry it (Job Card, Delivery Challan, invoice)?
- Q-266: On reopen, only warn that reservations and machine bookings are gone, or try to re-reserve stock automatically?
- Q-267: Should Start Production be a hard block without an approved BOM, or can the Owner override with a reason?
- Q-268: Should BOM quantities mean per one finished unit or per batch, and how should existing BOMs be read?
- Q-269: Block BOM submit while any material has no catalogue item, or auto-create catalogue items?
- Q-270: What makes a stage complete: at least one material, or a process specification as well?
- Q-272: Payment terms free text or a fixed list (Net 30, Advance 50%)? Is delivery date mandatory?
- Q-273: May Admin enter purchase rates on a PO (reverses the Owner-only rate rule), or should a PO with unpriced lines approve differently?
- Q-274: Duplicate PO for the same BOM material: warn only or hard block, and what over-order tolerance?
- Q-275: When a PO is cancelled, auto-discard its draft GRNs or just ignore them?
- Q-276: PO line unit differs from item unit: reject, or convert with a factor?
- Q-277: Who may reverse a confirmed GRN, and does it also reopen the PO and fix the supplier invoice?
- Q-278: Where should damaged stock be booked: a Quarantine location, and who can return it to the supplier?
- Q-279: What is the hard over-receipt ceiling (percent or rupee value) and who must sign off above it?
- Q-280: Who signs off a discrepancy invoice (Owner only?), and does it need a debit note?
- Q-282: May the Storekeeper see BOM material names and quantities (no prices) for orders?
- Q-283: On reconcile when stock moved after the count: recompute against live balance, or block and ask for a recount?

## 4. Acceptance per batch (every batch, before logging GATE_PASSED)
1. `pnpm typecheck` clean (run `pnpm db:generate` first if the Prisma client is stale).
2. `pnpm lint` 0 errors.
3. Full `pnpm test` (vitest) green, whole suite, not just touched files.
4. Each fixed row has a new or updated test that fails before the fix and passes after, with a `// R2-nnn` comment.
5. Never edit a test just to make it pass. The only allowed edits are contract-pin updates named in AGENT_GOTCHAS (navigation EXPECTED, never-leak list, audit-payloads money-key list, permission-matrix, server-gates, r3-sec-*, rule-history `it.fails` flips), each with a `// R2-nnn` comment and logged as CONTRACT; never delete an assertion.
6. No migrations applied (write only; list them in MAX_LOG for the human). Schema rows follow mis-schema-gate Half A/B and the schema-ahead-of-DB warning.
7. No tester-sheet writes (the PRO Mac updates the sheet after deploy; never mark Pass).
8. No git commits from this planning pass; builders commit to `fix/r2-round6` only, never merge to `main`.
9. Production build green at end of the last batch; Android release build for B2.
10. Money safety: no wage/rate figures in audit payloads or any non-Owner payload; run `mis-permission-matrix` for 252, 253, 273, 282, 239/255.

## 5. PROGRESS checklist (other Mac ticks; tick = DEV_DONE + gate green, else write state)
Batch B1
- [x] R2-234 shift null in kiosk pull
- [x] R2-247 (dup of 234)
- [x] R2-235 night-shift OT stale
- [x] R2-246 (dup of 235, server)
- [x] R2-248 parked TOO_OLD resolve
- [x] R2-251 bulk punch shiftId
- [x] R2-253 Admin/Owner kiosk operator
- [x] R2-252 regularization permission
- [x] R2-244 past-date Clock In (verify)
Batch B2
- [x] R2-246 Android WorkDate parity
- [x] R2-243 queue dismiss
- [x] R2-254 (dup of 243)
Batch B3
- [x] R2-236 DAILY Sunday pay
- [x] R2-245 (dup of 236)
- [x] R2-256 closed-month edit (needs Q-256)
- [x] R2-257 Half-Day column
- [x] R2-237 payroll layout
- [x] R2-258 (dup of 237)
Batch B4
- [x] R2-259 same-day rule save
- [x] R2-241 hide orphan rules
- [x] R2-242 late-rule enum
- [x] R2-260 (dup of 242)
Batch B5
- [x] R2-238 /mis/me unlinked card
- [x] R2-249 (dup of 238)
- [x] R2-239 desktop Me tab
- [x] R2-255 (dup of 239)
- [x] R2-240 cancel future leave (needs Q-240)
- [x] R2-261 revoke leave, Deferred (needs Q-240)
- [x] R2-250 Admin onboarding message (needs Q-250)
- [x] R2-262 3-day window, by design (log only)
- [x] R2-263 Supervisor roster, Enhancement (needs Q-263)
Batch B6
- [ ] R2-266 reopen order (needs Q)
- [ ] R2-267 BOM gate on start production (needs Q)
- [ ] R2-269 uncatalogued BOM item (needs Q)
- [ ] R2-270 empty stages (needs Q)
- [ ] R2-271 unpriced floor marker
- [ ] R2-282 STORE_GUY BOM view (needs Q)
- [ ] R2-264 order qty + UOM (SCHEMA, needs Q)
- [ ] R2-268 BOM basis (SCHEMA, needs Q, after 264)
- [ ] R2-265 Customer PO # (SCHEMA, needs Q)
Batch B7
- [ ] R2-275 PO cancel vs DRAFT GRN (needs Q)
- [ ] R2-276 PO unit mismatch (needs Q)
- [ ] R2-274 duplicate PO cap (needs Q)
- [ ] R2-273 Admin PO rates (needs Q, money rule)
- [ ] R2-272 PO delivery date + terms (SCHEMA, needs Q)
Batch B8
- [ ] R2-279 over-receipt ceiling (needs Q)
- [ ] R2-280 invoice variance sign-off (needs Q, maybe SCHEMA)
- [ ] R2-278 damaged qty quarantine (needs Q, likely SCHEMA)
- [ ] R2-277 reverse GRN (SCHEMA, needs Q)
Batch B9
- [ ] R2-281 store commit idempotency (verify)
- [ ] R2-283 count reconcile (needs Q)

## Final step (after B9)
- [ ] FINAL: ask owner to apply pending migrations (see Schema protocol, step 4), wait, re-verify, report ready to deploy
