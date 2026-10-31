# R2 Round 6C: tester bugs R2-284..R2-295 and R2-308..R2-373 (verbatim from sheet)

Source: tester sheet "MIS Testing R2-V2", tab Bugs, rows 278-355 (read 2026-11-01). The sheet has no R2-296..R2-307. 78 rows. Copied faithfully; this file is the only source for the Mac without sheet access. Columns: type, status, severity, role/screen, title, steps, expected, actual, device, round, fix notes (col L), build, tester result (N), tester comment (O). Plan: `R2_ROUND6C_PLAN.md`.

## R2-284
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Admin, Production Operator, Supervisor / `/mis/print/job-card/[id]`
- Title: Printed Job Card (Batch Production Record) lacks target order quantity and Customer PO # on shop-floor paperwork
- Steps: 1. Create and confirm an order. 2. Navigate to /mis/print/job-card/[id]. 3. Print the Batch Production Record for shop-floor operators. 4. Inspect the order details grid.
- Expected: Job Card prominently displays Target Production Quantity (e.g. 25,000 Boxes) and Customer PO # so press operators know target batch size.
- Actual: The order info grid displays only Customer, Delivery Date, Description, and Status. Target quantity and Customer PO are completely absent from the official printed batch record. Operators cannot tell what quantity to manufacture.
- Fix notes (col L): Add target quantity and customer PO reference to JobCardSnapshot and render in the top summary block of JobCardPrintPage.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/app/(mis)/mis/print/job-card/[id]/page.tsx lines 117-134. Target batch quantity is missing from print view.

## R2-285
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Storekeeper, Supervisor / `/mis/store/returns` & `/mis/store/issue`
- Title: Returned materials from an order do not restore allocation quota, permanently blocking re-issue of returned stock
- Steps: 1. Order ORD-1 has 500 kg paper allocated; 500 kg is issued. 2. Supervisor returns 200 kg unused paper via /mis/store/returns; Store accepts it. 3. Physical store balance increases by 200 kg. 4. Supervisor requests to re-issue 200 kg for ORD-1.
- Expected: Store can re-issue the 200 kg returned material because net issued quantity is only 300 kg of the 500 kg allocation.
- Actual: allocationFigures queries only STORE_ISSUE rows. It ignores STORE_RETURN entries. The allocation remains at 0 available, and allocationShortfalls throws: "asked for 200, but only 0 of the 500 allocated to this order is left". Re-issue is permanently blocked.
- Fix notes (col L): In allocationFigures, query STORE_RETURN rows linked to the order and deduct returnedQty from issuedQty in foldAllocationFigures.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/order-allocation.ts lines 47-58 and src/lib/mis/order-allocation.ts lines 41-55. Returned materials are ignored in allocation arithmetic.

## R2-286
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Supervisor, Storekeeper / `/mis/store/requests`
- Title: Partial Material Request approval marks request APPROVED and drops remaining balance without backorder tracking
- Steps: 1. Supervisor requests 100 kg ink on Material Request MRN-101. 2. Store only has 40 kg in stock; Storekeeper enters 40 kg actual issued. 3. Storekeeper clicks "Approve Request".
- Expected: System approves 40 kg and keeps request in PARTIAL status (or creates backorder note for balance 60 kg) so store fulfills when stock arrives.
- Actual: approveMaterialRequest flips status to APPROVED and sets actualIssuedQty: 40. The remaining 60 kg request is silently closed and forgotten. The supervisor never receives the balance material unless they re-type a new request.
- Fix notes (col L): Add PARTIAL status to MisMaterialRequest, keeping the unfulfilled balance open for subsequent issue upon GRN receipt.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/material-request.ts lines 158-185. Status is unconditionally set to APPROVED regardless of requested vs actual qty.

## R2-287
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Storekeeper, Supervisor / `/mis/store/pick-lists`
- Title: Staging a pick list does not reserve ledger balance, causing handover crashes when concurrent direct issues occur
- Steps: 1. Storekeeper picks items for Pick List PK-01 and clicks "Stage Pick List". 2. Physical materials are moved to staging bay. 3. Meanwhile, another user issues the same item directly from store (/mis/store/issue). 4. Storekeeper hands over PK-01 to supervisor.
- Expected: Staging a pick list locks/reserves the picked quantity in MisInventoryLedger so other store issues cannot steal staged goods.
- Actual: stagePickList only updates status: STAGED on the pick list without taking an inventory ledger reservation. When handOverPickList calls commitIssue, the balance check fails, throwing: "Cannot issue more than the stock balance", crashing the handover of physically staged goods.
- Fix notes (col L): Take a stock reservation (MisOrderStockAllocation or ledger hold) upon staging pick list, released when handed over.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/pick-list.ts lines 68-115 and src/server/mis/store.ts lines 1430-1450. No ledger lock exists during staging.

## R2-288
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Accounts, Owner / `/mis/supplier-invoices`
- Title: Supplier invoice lifecycle lacks payment settlement states (PAID / APPROVED_FOR_PAYMENT / REJECTED)
- Steps: 1. Vendor invoice arrives and matches GRN (MATCHED). 2. Owner verifies invoice and Accounts executes bank wire transfer. 3. Accounts attempts to mark invoice as "PAID" or record payment reference.
- Expected: Accounts can record payment details (Paid Date, Cheque/UTR Ref) and update invoice status to PAID to reconcile Accounts Payable.
- Actual: MisSupplierInvoiceStatus enum contains only MATCHED, DISCREPANCY_QTY, DISCREPANCY_PRICE, and PENDING_REVIEW. There is no PAID status or payment tracking action. Invoices remain on the board in MATCHED status forever.
- Fix notes (col L): Add PAID and APPROVED_FOR_PAYMENT to MisSupplierInvoiceStatus and add markInvoicePaidAction with payment reference.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in prisma/schema.prisma lines 1989-1995 and src/server/mis/supplier-invoice.ts lines 140-187. No payment tracking exists.

## R2-289
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Procurement / `/mis/suppliers`
- Title: deleteSupplier fails to check open purchase orders in RECEIVING status
- Steps: 1. Purchase Order PO-1 is in RECEIVING status (e.g. goods received 100% damaged per R2-75). 2. Admin navigates to /mis/suppliers. 3. Admin clicks "Delete" on the vendor.
- Expected: System checks all open PO statuses including RECEIVING and blocks supplier deletion.
- Actual: deleteSupplier checks OPEN_PO_STATUSES defined as DRAFT, PENDING_APPROVAL, APPROVED, PARTIAL. It omits RECEIVING. The supplier is soft-deleted while PO is active in RECEIVING, breaking subsequent replacement GRN receipts.
- Fix notes (col L): Include RECEIVING in OPEN_PO_STATUSES array in src/server/mis/supplier.ts line 83.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/supplier.ts line 83. RECEIVING status is missing from OPEN_PO_STATUSES.

## R2-290
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: QA Manager, Owner / `/mis/traceability/[orderId]`
- Title: Summing mixed-unit production quantities in Order Traceability generates false total produced and wastage metrics
- Steps: 1. Create order with Stage 1 (Sheets) producing 1,000 SHEETS and Stage 2 (Cartons) producing 10,000 PIECES. 2. Open /mis/traceability/[orderId]. 3. Observe "Total Produced" summary card.
- Expected: Traceability view groups produced totals by unit (e.g. "1,000 SHEETS · 10,000 PIECES") rather than adding numbers with different UOMs.
- Actual: getOrderTrace sums production logs as a single number: totalProduced = productionLogs.reduce((s, l) => s + Number(l.qtyProduced), 0). The screen displays "11,000 produced", corrupting yield calculations and customer CoA audits.
- Fix notes (col L): Group production quantities by unit in getOrderTrace and return a unit-keyed summary (byUnit: Record<string, number>).
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/traceability.ts lines 65-67. Raw numeric addition is performed across logs with differing units.

## R2-291
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Storekeeper / `/mis/grn/[id]`
- Title: Direct GRN confirmation on /mis/grn/[id] lacks client idempotency token, risking duplicate submissions on gate tablets
- Steps: 1. Gatekeeper enters GRN lines on warehouse tablet. 2. Taps "Confirm GRN". 3. Tablet WiFi connection hiccups; browser spinner hangs. 4. Gatekeeper taps "Confirm GRN" again.
- Expected: Server evaluates idempotency token and ignores duplicate tap without throwing errors.
- Actual: confirmGrnAction and confirmGRN take no idempotencyKey. If the first request commits while the response is lost, the second tap throws "GRN already confirmed", confusing gate staff and risking double ledger postings on concurrent carts.
- Fix notes (col L): Add idempotencyKey parameter to confirmGRN and confirmGrnAction, verified via runOnce.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/grn.ts line 527 and src/app/(mis)/mis/grn/actions.ts line 54. confirmGRN does not accept an idempotencyKey.

## R2-292
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Storekeeper, Admin / `/mis/inventory` & `/mis/store/transactions`
- Title: Standalone stock adjustments and manual store transactions take no idempotency key
- Steps: 1. Admin makes manual adjustment of +50 units on /mis/inventory. 2. Double-clicks "Save". 3. Two requests reach the server simultaneously.
- Expected: Idempotency prevents duplicate manual adjustments within the same transaction window.
- Actual: adjustInventory, createStoreIn, and createStoreOut have no idempotency check. Two identical manual adjustments are written to MisInventoryLedger, doubling the adjustment unexpectedly.
- Fix notes (col L): Accept an optional idempotency token in adjustInventory, createStoreIn, and createStoreOut.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/inventory.ts line 97 and src/server/mis/store.ts lines 185 and 276. No idempotency protection exists.

## R2-293
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Admin / `/mis/customers` & `/mis/suppliers`
- Title: Duplicate Customer Code or Supplier Code throws unhandled Prisma P2002 exception in UI
- Steps: 1. Navigate to /mis/customers. 2. Create customer with code CUST-01. 3. Create another customer and enter the same code CUST-01. 4. Click Save.
- Expected: UI displays friendly inline error: "Customer code CUST-01 already exists. Choose a unique code."
- Actual: createCustomer executes db.misCustomer.create without pre-checking code. Prisma throws a raw P2002 unique constraint error, causing a generic error toast and leaving the slide-over stuck.
- Fix notes (col L): Catch P2002 in customer.ts and supplier.ts and return user-friendly duplicate code message.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/customer.ts lines 44-60 and src/server/mis/supplier.ts lines 48-64. No duplicate code check exists.

## R2-294
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: QC Manager, Customer / `/mis/print/coa/[id]`
- Title: Certificate of Analysis (CoA) prints live unapproved data when version snapshot parameter is omitted
- Steps: 1. Order has an approved frozen COA version 1. 2. A shop-floor operator subsequently records an unverified live QC check. 3. QC manager navigates to /mis/print/coa/[id] without ?v=1 parameter.
- Expected: System prints the approved frozen COA snapshot as default, or displays a banner indicating that live unapproved changes exist.
- Actual: Without ?v=, dataSource falls back to live checks if document version matching is ambiguous, printing unapproved tests on official customer certificates.
- Fix notes (col L): Default to the latest APPROVED document snapshot in CoaPrintPage whenever an approved version exists.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/app/(mis)/mis/print/coa/[id]/page.tsx lines 40-54. liveQc is loaded and printed when snapshot lookup is bypassed.

## R2-295
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Supervisor, In-Charge / `/mis/production/sign-off/[phaseId]`
- Title: Job phase sign-off allows blank handover notes when previous manufacturing phases were marked NOT_APPLICABLE
- Steps: 1. Admin plans 4 phases: Printing, Lamination, Die-Cutting, Packing. 2. Supervisor marks Lamination as NOT_APPLICABLE. 3. In-charge signs off Die-Cutting with blank notes.
- Expected: Sign-off requires an explicit handover note explaining why an upstream manufacturing stage was skipped.
- Actual: signOffPhase allows input.notes to be null or empty even if upstream phases were bypassed or had resolved QC failures. Handover audit record lacks justification for skipped processes.
- Fix notes (col L): In signOffPhase, require a non-empty note if any preceding phase was marked NOT_APPLICABLE.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/job-phases.ts lines 369-420. notes field is optional during sign-off.

## R2-308
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Supervisor, Machine Operator / `/mis/clearance` & `/mis/production`
- Title: Line Clearance in SHIFT mode never expires when cleared outside active shift window or during pre-shift buffer
- Steps: 1. Supervisor clears machine line at 06:45 for morning shift (starts 07:00). 2. System saves clearance with shiftId: null. 3. Morning shift finishes at 15:00 and evening shift starts. 4. Operator logs production at 17:00.
- Expected: Line clearance should validate expiry against shift end time or default duration even if shiftId was unassigned at creation.
- Actual: In line-clearance.ts line 98, isGrantingShiftStillActive is gated behind if (latest.mode === 'SHIFT' && latest.shiftId). When shiftId is null, clearance never expires, allowing uninspected machines to run for weeks.
- Fix notes (col L): If shiftId is null on SHIFT clearance, fall back to resolved shift at clearedAt or default maxMinutes window before clearing line.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/line-clearance.ts line 98. When shiftId is null, expiry evaluation is completely bypassed.

## R2-309
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Supervisor, Machine Operator / `/mis/clearance` & `/mis/production`
- Title: Line Clearance in JOB mode permits all subsequent orders to run when cleared prior to machine allocation booking
- Steps: 1. Supervisor performs wash-up and clears machine line before booking Order A. 2. Clearance records orderId: null. 3. Production operator logs jobs for Order A and later Order B.
- Expected: Line clearance in JOB mode requires an order assignment and must invalidate when a different order begins running.
- Actual: In line-clearance.ts lines 86-96, order mismatch check requires if (orderId && latest.orderId && latest.orderId !== orderId). Because latest.orderId is null, check passes for all orders indefinitely with no stereo verification.
- Fix notes (col L): Enforce orderId parameter when clearing line in JOB mode, or fail assertLineCleared if latest.orderId is null.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/line-clearance.ts lines 89-94. If latest.orderId is null, clearance validates any order.

## R2-310
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Supervisor, Phase In-Charge / `/mis/orders/[id]` & `/mis/qc`
- Title: Phase In-Charge blocked from acknowledging failed QC checks when check has no bomStageId
- Steps: 1. Quality officer logs a failure from main QC screen without stage (bomStageId is null). 2. Supervisor / Phase In-charge attempts to acknowledge deviation.
- Expected: Phase In-Charge of the order or shift supervisor can review and sign off on defect acknowledgment.
- Actual: In job-phases.ts lines 734-745, system queries phases matching check.bomStageId. Since bomStageId is null, phases array is empty, isPhaseInCharge evaluates to false, and supervisor receives NOT_THE_IN_CHARGE error.
- Fix notes (col L): If bomStageId is null, check if actor is in-charge of any active phase on the order, or allow assigned shift supervisor sign-off.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/job-phases.ts lines 734-745. Empty phases array blocks non-admin supervisors from acknowledging un-staged checks.

## R2-311
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: QC Officer / `/mis/qc` & `/mis/orders/[id]`
- Title: QC Officer role lacks phase.write permission, blocking Quality Managers from approving deviation waivers
- Steps: 1. QC Inspector records FAIL on critical parameter. 2. Quality Manager inspects lot, deems variance within acceptable customer tolerance, and clicks "Acknowledge".
- Expected: QC Officer or Quality Manager should have authority to record quality waivers and failure acknowledgments.
- Actual: acknowledgeQcFailure requires phase.write permission. In permissions.ts line 155, QC role has only phase.read and qc.write. Quality personnel cannot sign off on waivers without Admin intervention.
- Fix notes (col L): Add phase.write or dedicated qc.acknowledge permission to QC role in permissions.ts.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/permissions.ts line 155 and src/server/mis/job-phases.ts line 711. QC role cannot call acknowledgeQcFailure.

## R2-312
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: QC Inspector / `/mis/qc/[id]` (Checklist Tab)
- Title: Checklist inspection sheet splits across midnight on night shift due to calendar-day partitioning instead of factory shift date
- Steps: 1. Night shift runs 19:00 to 07:00. Inspector taps checks at 20:00, 21:00, 22:00, 23:00. 2. Clock strikes 00:01 midnight. 3. Inspector refreshes checklist tablet.
- Expected: Night shift checklist form retains hourly checks across the full shift window until shift handover.
- Actual: In qc-template.ts line 86, filterChecksToFactoryDay compares factoryDateKey(c.checkTime, timeZone) === dateKey. At midnight, dateKey changes, wiping the checklist blank and hiding earlier shift checks.
- Fix notes (col L): Partition checklist by active shift date rather than calendar date so overnight shifts stay intact on a single sheet.
- Device: Mobile / Kiosk | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/qc-template.ts lines 80-87. Calendar date cut splits night-shift checklist in half.

## R2-313
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Admin / `/mis/settings/defects`
- Title: Re-creating a soft-deleted defect type code crashes system with unhandled P2002 unique constraint exception
- Steps: 1. Admin soft-deletes obsolete defect code 'STAIN' via deleteDefectType. 2. Later, Admin re-creates 'STAIN' with updated severity.
- Expected: System should restore the soft-deleted defect type with updated parameters or prevent duplicate creation with friendly error.
- Actual: MisDefectType has a database-level unique constraint on code without partial index on deletedAt. Prisma throws uncaught P2002 unique constraint failure, crashing the UI.
- Fix notes (col L): In createDefectType, check for soft-deleted record with matching code and restore/update it, or handle P2002 error gracefully.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/defect-type.ts lines 27-40 and prisma/schema.prisma line 1098. No check for existing soft-deleted code.

## R2-314
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: QC Manager, Owner / `/mis/settings/qc` & `/mis/qc`
- Title: ANSI/ASQ Z1.4 sampling enforces identical acceptance limits (Ac) for both Major and Minor defects
- Steps: 1. Plant configures AQL Level II with limit 1.5. 2. Inspector logs AQL sample with 2 minor cosmetic blemishes and 0 major defects. 3. System evaluates sample.
- Expected: Minor defects (cosmetic) should follow higher acceptance thresholds (e.g. AQL 4.0) than Major defects (e.g. AQL 1.5) per ISO 2859-1 standards.
- Actual: In aql.ts line 166, thresholdsFromPlan sets majorMax: plan.accept and minorMax: plan.accept. Minor cosmetic specks trigger lot rejection at the same strict threshold as structural box failures.
- Fix notes (col L): Add separate AQL settings for Major (qc.aql_major) and Minor (qc.aql_minor) in business rules and evaluate independently.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/aql.ts line 166. Both majorMax and minorMax are bound to the identical plan.accept figure.

## R2-315
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Customer, QC Officer / `/mis/print/coa/[id]`
- Title: Certificate of Analysis (CoA) prints raw historic defect counts next to 'Overall Result: PASS', causing client audit rejection
- Steps: 1. Initial print setup check failed on registration, but issue was resolved and re-tested PASS. 2. Print CoA for dispatch.
- Expected: Summary box on certified release document should report final compliant batch status (e.g. Resolved / Compliant) without raw setup failure counts.
- Actual: In CoaPrintPage lines 160-165, summary prints failCount = qcLogs.filter(q => q.result === 'FAIL').length. Document prints 'Total checks: 12  Pass: 11  Fail: 1' directly beneath 'Overall Result: PASS', prompting customer QA rejection.
- Fix notes (col L): Display unresolvedFailures count or distinguish in-process resolved checks from final batch release parameters on CoA.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/app/(mis)/mis/print/coa/[id]/page.tsx lines 59, 164. Summary calculates raw fail count across all historical tests.

## R2-316
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Dispatch Officer, Customer, QC Officer / `/mis/print/coa/[id]`
- Title: Printed CoA omits mandatory Batch / Lot Number, Manufacturing Date, and Order Quantity required by ISO 9001/BRCGS
- Steps: 1. Order completed and dispatched. 2. Generate Certificate of Analysis via /mis/print/coa/[id]. 3. Inspect document header and order info.
- Expected: CoA must specify physical Batch/Lot Number, Manufacturing Date, and Certified Quantity to be legally valid for inbound customer receiving.
- Actual: Template displays only customer name, product description, and delivery date. It has no Batch Number, Mfg Date, or Batch Quantity, rendering the certificate non-compliant for regulated packaging clients.
- Fix notes (col L): Include batchNumber, mfgDate, and targetQuantity on CoaSnapshot and render in CoaPrintPage order info grid.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/app/(mis)/mis/print/coa/[id]/page.tsx lines 101-122. Mandatory ISO lot identifiers are absent from the document.

## R2-317
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: QC Supervisor / `/mis/qc/grid`
- Title: Hourly QC Grid marks all unallocated IN_PRODUCTION orders as overdue across every hour of the shift
- Steps: 1. Plant has 30 orders in status IN_PRODUCTION awaiting scheduling. 2. Open whole-floor QC grid at /mis/qc/grid. 3. Inspect order rows.
- Expected: QC grid should show hourly check requirements only for orders actively booked/running on machines during that shift.
- Actual: In qc-grid.ts lines 93-110, unbooked orders get runs: undefined, which buildQcGrid interprets as 'all hours due'. The screen displays dozens of false overdue alerts for queued jobs.
- Fix notes (col L): Filter grid orders to those with active machine allocations during the selected shift window, or mark unbooked orders as pending.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/qc-grid.ts line 109 and src/lib/mis/qc-grid.ts. Unbooked orders default to all-hour overdue status.

## R2-318
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Quality Auditor, Plant Manager / `/mis/qc/defects`
- Title: Defect Report machine attribution dumps concurrent order stages and post-shift checks into '__several' or '__none'
- Steps: 1. Order runs Printing on Press 1 and Die Cutting on Cutter 2 on the same day. 2. Inspector records cutting defect. 3. View /mis/qc/defects.
- Expected: Defect should attribute directly to the specific machine where the inspection occurred.
- Actual: attributeMachine matches bookings by timestamp and orderId because MisQcCheck has no machineId column. When multiple machines run the same order, it attributes to '__several'; if logged after booking ends, to '__none'.
- Fix notes (col L): Add machineId (Uuid?) column to MisQcCheck schema and allow inspector to record machine on check entry.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/defects.ts lines 67-72. Attribution fails whenever order has parallel machine allocations.

## R2-319
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Supervisor / `/mis/orders/[id]`
- Title: Case-sensitive parameter matching in evaluateCloseGates permanently blocks order completion on casing variations
- Steps: 1. QC Inspector records FAIL on parameter 'Shade'. 2. Machine operator corrects ink mix, inspector records PASS on parameter 'shade' (lowercase). 3. Admin attempts to complete order.
- Expected: evaluateCloseGates should normalize parameter names case-insensitively so 'shade' resolves 'Shade'.
- Actual: In order-transitions.ts line 100, key is `${check.bomStageId ?? ''}|${check.parameterName ?? 'General'}` without normalization. 'Shade' and 'shade' are treated as distinct parameters, leaving failure unresolved and blocking order close.
- Fix notes (col L): Normalize parameterName using .trim().toLowerCase() in evaluateCloseGates matching qc-verdict.ts standard.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/order-transitions.ts line 100. Key is case-sensitive.

## R2-320
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: QC Inspector / `/mis/qc/[id]` (AQL Sample Dialog)
- Title: AQL Sample dialog lacks Process Stage selector, forcing all samples into un-staged order-level checks
- Steps: 1. Open /mis/qc/[id]. 2. Click "Record AQL Sample". 3. Inspect dialog fields: Sample Size, Lot Size, Defect Lines, Notes.
- Expected: Inspector can select the specific process stage (e.g. Printing, Lamination, Die Cutting) the AQL lot was drawn from.
- Actual: Dialog has no stage dropdown. recordAqlSampleAction creates check with bomStageId: undefined, corrupting stage-wise Pareto quality metrics.
- Fix notes (col L): Add Stage Select component to AQL sample dialog in qc-detail-screen.tsx and pass bomStageId to recordAqlSampleAction.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/qc/qc-detail-screen.tsx lines 145-155. Stage input is missing from AQL dialog.

## R2-321
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: QC Inspector, Supervisor / `/mis/qc/grid` & `/mis/qc/[id]`
- Title: recordAqlSampleAction omits revalidation of /mis/qc/grid, displaying stale AQL decisions on floor board
- Steps: 1. Open whole-floor QC grid at /mis/qc/grid. 2. In another tab, record an AQL Sample PASS on ORD-10. 3. Navigate back to /mis/qc/grid.
- Expected: QC Grid AQL footer panel updates immediately with the new sample verdict and sample size.
- Actual: recordAqlSampleAction in actions.ts revalidates only /mis/qc and /mis/qc/[id], omitting /mis/qc/grid. Floor operators continue viewing obsolete AQL panel status until hard refresh.
- Fix notes (col L): Add revalidatePath('/mis/qc/grid') to recordAqlSampleAction in src/app/(mis)/mis/qc/actions.ts.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/app/(mis)/mis/qc/actions.ts lines 36-37. /mis/qc/grid is omitted from revalidation list.

## R2-322
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Supervisor, Owner / `/mis/qc` & `/mis/orders/[id]`
- Title: getQcSummary reports historic pre-setup defect quantities on orders even after successful resolution
- Steps: 1. Inspector logs setup test with 100 defective sheets (FAIL). 2. Press is adjusted; subsequent 10 hourly tests record PASS with 0 defects. 3. View order QC summary.
- Expected: Summary should distinguish setup/resolved defects from net active lot rejects.
- Actual: In qc.ts line 300, totalDefectQty sums all checks where result === 'FAIL'. Order header displays 'Defects: 100' and pulls down overall pass rate even though batch passed 100%.
- Fix notes (col L): Exclude resolved checks or voided setup waste from net final batch defect totals.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/qc.ts line 300. Defect quantity sums across all historic failed checks.

## R2-323
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Admin, QC Inspector / `/mis/settings/qc` & `/mis/qc/[id]`
- Title: Deactivating a checklist template orphans active order checks from template view without warning
- Steps: 1. Plant updates printing checklist template and deactivates version 1. 2. Inspector views /mis/qc/[id] for order run under version 1.
- Expected: System maintains read access to archived template checks or displays an archived banner.
- Actual: In qc-template.ts line 61, listQcTemplates filters out inactive templates by default. In qc-detail-screen.tsx line 79, checks linked to deactivated templateId lose their checklist view and render as plain unformatted rows.
- Fix notes (col L): Include inactive templates with an 'Archived' indicator when viewing historical order checks.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/qc-template.ts lines 58-65 and src/components/mis/qc/qc-detail-screen.tsx.

## R2-324
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Owner, Accounts Officer / `/mis/payroll` & Bank Transfer Export
- Title: Bank Transfer CSV exports un-deducted Gross Pay, skipping statutory PF, ESIC, PT, and advance recovery
- Steps: 1. Owner generates monthly payroll and clicks 'Export Bank Transfer CSV'. 2. Open exported CSV. 3. Inspect salary payment figures.
- Expected: Bank transfer CSV must export Net Pay after deducting statutory PF (12%), ESIC (0.75%), Professional Tax (PT), and Salary Advances.
- Actual: In payroll-ledger.ts lines 21-39 and 78-95, wage ledger and bank transfer use grossPay directly. System transfers full un-deducted gross salary to employee bank accounts, exposing factory to non-compliance under EPF & MP Act 1952.
- Fix notes (col L): Add deduction columns (PF, ESIC, PT, Advance) to PayrollRow and compute netPay = grossPay - deductions for bank transfer export.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/payroll-ledger.ts lines 28-36, 94. File exports grossPay with zero statutory deductions.

## R2-325
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Accounts Officer, Owner / `/mis/supplier-invoices`
- Title: Three-Way Matching flags all Indian GST Tax Invoices as DISCREPANCY_PRICE due to missing tax/GST calculation
- Steps: 1. Supplier submits Tax Invoice for ₹1,18,000 (₹1,00,000 base + 18% GST). 2. Store Guy enters invoice amount ₹1,18,000. 3. System evaluates 3-way match.
- Expected: System should calculate GST / taxes based on item HSN/SAC rate or compare base amount before flagging price discrepancy.
- Actual: In invoice-match.ts lines 83-90, expected = dc * ratePerUnit (base price without taxes). Expected is ₹1,00,000; billed is ₹1,18,000. System flags DISCREPANCY_PRICE on 100% of vendor invoices that include statutory GST.
- Fix notes (col L): Add gstRate or taxAmount to MisPurchaseOrder / MisSupplierInvoice, or calculate expectedAmount including tax.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/invoice-match.ts lines 83-90. Expected amount ignores GST taxes, triggering false price discrepancy.

## R2-326
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Store Guy / `/mis/store/out` (Cart Checkout)
- Title: Duplicate item in store issue cart corrupts running inventory ledger balance and bypasses stock availability checks
- Steps: 1. Store Guy adds Item A (Qty: 50) and Item A again (Qty: 60) to checkout cart. Total stock is 100. 2. Click "Issue Stock".
- Expected: System should consolidate cart lines by itemId, validate total quantity (110 > 100), and refuse issue.
- Actual: In store.ts lines 1434-1442, available check tests each cart line individually against static initial balance (50 <= 100, 60 <= 100). In lines 1467-1485, ledger balance is written as balance - line.qty without updating running map, saving corrupted balance.
- Fix notes (col L): Consolidate cart lines by itemId before checking stock, and update ledgerBalances map in transaction loop.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store.ts lines 1434-1442 and 1467-1485. Running balance map is not updated per line.

## R2-327
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Admin, Supervisor / `/mis/production` & `/mis/orders/[id]`
- Title: Logging zero produced quantity satisfies PRODUCTION_LOGGED close gate, allowing unmanufactured orders to complete
- Steps: 1. Order has status IN_PRODUCTION. 2. Operator logs production with qtyProduced: 0 and qtyWaste: 0. 3. Admin clicks "Mark Complete".
- Expected: Order completion requires produced output >= 1 or physical product logged before closing order.
- Actual: In production.ts line 420, qtyProduced >= 0 is allowed. In orders.ts line 188, computeCloseGates counts misProductionLog rows without checking qtyProduced > 0. A 0-qty placeholder log permanently satisfies the gate.
- Fix notes (col L): In computeCloseGates, verify sum(qtyProduced) > 0 or require qtyProduced > 0 on standalone production logs.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/production.ts line 420 and src/server/mis/orders.ts lines 188-190. Zero-output log satisfies close gate.

## R2-328
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Supervisor / `/mis/production` (Edit Entry)
- Title: Makeready setup waste exceeding good output permanently traps production entry from being edited
- Steps: 1. Press operator runs setup and logs qtyProduced: 0, qtyWaste: 50. 2. Supervisor notices incorrect operator name and clicks "Edit". 3. Click "Save".
- Expected: Supervisor can correct operator name or notes on setup waste logs.
- Actual: In production.ts line 747, editProductionLog throws if (qtyWaste > qtyProduced). This check was omitted on creation but is strictly enforced on edit, permanently locking legitimate make-ready setup entries.
- Fix notes (col L): Allow qtyWaste > qtyProduced when makereadyMinutes > 0, or relax edit validation to match createProductionLog.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/production.ts line 747. Edit refuses logs where waste exceeds produced qty.

## R2-329
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Machine Operator / `/mis/production` (Back-dated Entry)
- Title: Back-dated production entry parsed via UTC midnight causes shift misattribution in Asia/Kolkata timezone
- Steps: 1. Operator logs production for yesterday at 14:00 using date picker (producedOn: '2026-10-30'). 2. System resolves shift.
- Expected: System should resolve shift using factory timezone midnight or default operational hours.
- Actual: In production.ts lines 442-447, new Date('2026-10-30') is parsed in UTC, producing 05:30 AM IST. Shift lookup evaluates factoryMinuteOfDay(05:30) which falls outside morning/day shifts, misattributing output to ghost shifts.
- Fix notes (col L): Parse producedOn using dateKeyToDbDate or combine with current factory time-of-day before shift resolution.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/production.ts line 442. UTC midnight parsing creates 05:30 AM IST time skew.

## R2-330
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Owner / `/mis/job-phases` (Sign Off Phase)
- Title: Admin and Owner blocked from signing off job phase directly, forcing temporary reassignment of in-charge role
- Steps: 1. Machine supervisor goes home after shift. Phase printing is finished. 2. Admin inspects work and clicks "Sign Off Phase".
- Expected: System Admin or Owner should have administrative authority to sign off completed job phases.
- Actual: In job-phases.ts lines 374-382, isInCharge check strictly requires phase.inCharge.userProfileId === actor.userId. Admins and Owners receive NOT_THE_IN_CHARGE error and must execute reassignInCharge to themselves before signing.
- Fix notes (col L): Allow ADMIN and OWNER roles to sign off phases directly with an accountable audit note.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/job-phases.ts lines 374-382. Admin/Owner cannot sign off unless assigned as in-charge.

## R2-331
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Admin, Plant Manager / `/mis/job-phases` (Reopen Phase)
- Title: Owner-only phase.reopen permission halts factory operations when Owner is absent and signed phase needs correction
- Steps: 1. In-charge accidentally signs off Die Cutting phase with wrong waste numbers. 2. Plant Manager (Admin) attempts to reopen phase.
- Expected: Admin role should have authority to reopen job phases with mandatory audit reason.
- Actual: In job-phases.ts line 612 and permissions.ts line 125, reopenPhase enforces requirePermission('phase.reopen') which is granted exclusively to OWNER. When Owner is unavailable, plant operations cannot adjust signed routes.
- Fix notes (col L): Grant phase.reopen permission to ADMIN role with mandatory audit logging.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/job-phases.ts line 612 and src/lib/mis/permissions.ts line 125. ADMIN lacks phase.reopen.

## R2-332
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Supervisor / `/mis/crew` (Worker Allocation)
- Title: WORKABLE_ROLES restriction excludes Shop-Floor Supervisors and Lead Operators from machine crew allocation
- Steps: 1. Senior printing operator holds role SUPERVISOR to access tablet. 2. Floor supervisor attempts to allocate them to Press 1. 3. Inspect worker selection list.
- Expected: Supervisor can allocate any active production employee or lead operator to run machinery.
- Actual: In worker-allocation.ts line 36 & line 103, WORKABLE_ROLES is hardcoded to ['WORKER', 'QC']. Anyone with role SUPERVISOR is silently excluded from eligible employees, blocking lead operators from being booked.
- Fix notes (col L): Expand WORKABLE_ROLES to include 'SUPERVISOR' or add isMachineOperator flag on MisEmployee.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/worker-allocation.ts lines 36 and 103. Role SUPERVISOR is filtered out.

## R2-333
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Supervisor, Admin / `/mis/crew` (Past Shift Booking)
- Title: 7-day forward window in assertDateInRange blocks retroactive crew reconciliation for past factory shifts
- Steps: 1. On Monday morning, supervisor reconciles weekend machine crew allocations (2 days ago). 2. Select Saturday's date and click "Assign Crew".
- Expected: Supervisors and Admins should be allowed to back-date crew allocations within the active correction window.
- Actual: In worker-allocation.ts lines 124-126, assertDateInRange enforces dateKey >= earliest (shift start today). Selecting past dates throws: "Pick a date from today to 7 days ahead", preventing historical crew reconciliation.
- Fix notes (col L): Allow retroactive crew allocation within the attendance correction window for ADMIN and SUPERVISOR roles.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/worker-allocation.ts lines 124-126. Past dates are unconditionally rejected.

## R2-334
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Quality Auditor, Customer / `/mis/orders/[id]` (Traceability)
- Title: Traceability engine lacks Batch Number, Reel Lot #, and Inbound Heat ID, failing BRCGS and ISO packaging audits
- Steps: 1. Customer reports defect on Box Batch #B-900. 2. Quality Auditor opens Order Traceability (/mis/orders/[id]/trace). 3. Identify paper reel and ink batch IDs.
- Expected: Traceability view should link physical finished batch numbers to raw material GRN lot numbers and supplier reel barcodes.
- Actual: In traceability.ts lines 130-150, loadIssuedMaterials queries only itemId and changeQty. Neither inventory ledger nor store transactions record batchNumber or lotNumber. Auditor cannot trace which reel batch went into which box.
- Fix notes (col L): Add lotNumber / batchNumber to MisInventoryLedger and display raw material batch linkages in OrderTrace view.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/traceability.ts lines 130-150 and prisma/schema.prisma. No batch or lot columns exist.

## R2-335
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Accounts Officer / `/mis/supplier-invoices` (3-Way Match)
- Title: Case-sensitive exact invoice number matching in GRN three-way match fails on trailing spaces or casing mismatch
- Steps: 1. Store Guy creates GRN with supplier invoice 'inv-9988 '. 2. Accounts creates invoice record with 'INV-9988'. 3. Run reconciliation.
- Expected: Reconciliation should match supplier invoice numbers case-insensitively with trimmed whitespace.
- Actual: In supplier-invoice.ts line 89, matching filters po.grns where g.supplierInvoiceNo === inv.invoiceNo. Casing or trailing whitespace differences cause empty items array, failing match into PENDING_REVIEW.
- Fix notes (col L): Normalize invoice numbers with .trim().toUpperCase() in matchFor before comparing GRN references.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/supplier-invoice.ts line 89. String equality is strictly case- and space-sensitive.

## R2-336
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Admin / `/mis/items` (Item Master)
- Title: Soft-deleting an Item does not verify active stock or open BOMs, and recreating it triggers P2002 crash
- Steps: 1. Admin soft-deletes item 'PAPER-300GSM' currently held in inventory. 2. Later, Admin recreates 'PAPER-300GSM' with updated specs.
- Expected: System should warn/block deletion if stock balance > 0 or item is in active BOMs, and handle duplicate codes gracefully.
- Actual: deleteItem sets deletedAt without checking MisInventoryLedger balance or active BOM materials. When recreating, Prisma throws uncaught P2002 unique constraint error on code, crashing the application.
- Fix notes (col L): Block item deletion if balanceQty > 0, and restore soft-deleted items on code recreation in createItem.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/item.ts lines 81-83, 105-112 and prisma/schema.prisma line 886. No stock check on deletion; code unique index crashes on recreate.

## R2-337
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: HR, Supervisor / `/mis/shifts/roster`
- Title: Shift roster lacks range splitting, forcing deletion of entire monthly history to reassign a worker for one week
- Steps: 1. Worker assigned to Day Shift for October (Oct 01 - Oct 31). 2. Supervisor reassigns worker to Night Shift for Oct 20 - Oct 27. 3. Click "Assign Roster".
- Expected: System should automatically split or update overlapping roster date spans.
- Actual: In shift-roster.ts lines 46-50, assignRoster checks rosterRangesOverlap and throws: "Already rostered in that range... Remove old entry first". Deleting the old entry wipes past attendance shift context for earlier weeks.
- Fix notes (col L): Support automatic date range slicing or updating existing roster entries when assignRoster overlaps.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/shift-roster.ts lines 46-50. Overlapping range assignment is unconditionally blocked.

## R2-338
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: QC Manager, Dispatch Officer / `/mis/print/coa/[id]`
- Title: CoA approval blocked until order status is COMPLETED or DELIVERED, forcing dispatch trucks to carry 'DRAFT' certificates
- Steps: 1. Production finishes order ORD-50. Order status is IN_PRODUCTION or READY_FOR_DISPATCH. 2. QC Manager attempts to approve CoA.
- Expected: QC Manager can approve official release CoA before shipment departs factory dock.
- Actual: In document-versions.ts lines 208-210, approveDocumentVersion throws if coa.order.status !== 'COMPLETED' && status !== 'DELIVERED'. Consequently, printed CoA displays red 'DRAFT CERTIFICATE' banner, causing client QA rejection.
- Fix notes (col L): Allow CoA approval when QC gates and physical production checks pass, regardless of ERP order status.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/document-versions.ts lines 208-210. Approval is gated on order status.

## R2-339
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Supervisor, Plant Manager / `/mis/machines` (Machine Board)
- Title: Machine Board Map overwrite hides concurrent allocations and spawns duplicate bookings on late production entries
- Steps: 1. Machine has two allocations spanning current time. 2. Machine booking ends at 14:00, but press runs until 14:20. 3. Operator logs at 14:15.
- Expected: Machine board should represent active multi-booking states and extend existing allocation rather than creating duplicates.
- Actual: In machines-board.ts lines 79-81, Map constructor overwrites first allocation. At 14:05, machine displays FREE; logging production triggers NO_BOOKING and auto-creates a duplicate allocation block.
- Fix notes (col L): Handle multiple active allocations per machine in getMachineBoard and extend recent booking if log is within grace window.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/machines-board.ts lines 79-81 and src/server/mis/production.ts line 205. Map overwrites duplicate allocations.

## R2-340
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Worker / `/mis/me` (Punch Regularization)
- Title: Worker punch regularization submission enforces attendance.write permission which WORKER role lacks, causing 403 error
- Steps: 1. Worker forgets badge punch and opens /mis/me. 2. Submits punch regularization request. 3. System checks permissions.
- Expected: Worker can submit missed punch regularization for their own employee record.
- Actual: In punch-regularization.ts line 75, submitPunchRegularization calls requirePermission('attendance.write'). In permissions.ts line 190, WORKER role has only attendance.read. Worker receives 403 MisForbiddenError.
- Fix notes (col L): Add attendance.regularize or own-record regularization exception for WORKER role in requirePermission.
- Device: Mobile / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/punch-regularization.ts line 75 and src/lib/mis/permissions.ts line 190. WORKER lacks attendance.write.

## R2-341
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Attendance Operator / `/mis/attendance/regularization`
- Title: Punch regularization review is gated on clearance.write, locking Attendance Operators out of reviewing HR punch requests
- Steps: 1. Attendance Operator logs in to review pending worker punch regularization requests. 2. Open /mis/attendance/regularization. 3. Click "Approve".
- Expected: Attendance Operator or HR Manager should have authority to approve or reject employee punch corrections.
- Actual: In punch-regularization.ts line 28, REVIEW_ACTION is set to clearance.write (shop-floor machine clearance). Attendance Operators do not hold line clearance permissions, blocking them from approving attendance regularizations.
- Fix notes (col L): Change REVIEW_ACTION in punch-regularization.ts to attendance.write or dedicated attendance.review permission.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/punch-regularization.ts line 28. Attendance review is improperly bound to clearance.write.

## R2-342
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Supervisor, Super Attendance Operator / `/mis/queue` (Offline Queue Inbox)
- Title: Offline queue clearance resolution requires clearance.write which Super Attendance Operator lacks and queue.review which Supervisor lacks
- Steps: 1. Tablet loses Wi-Fi on shop floor and parks production entry with CLEARANCE_EXPIRED. 2. Supervisor or Super Attendance Operator attempts resolution.
- Expected: Authorized floor supervisor or attendance administrator can resolve parked entries without cross-permission deadlock.
- Actual: In queue-resolve.ts lines 26 & 58, resolving requires both queue.review AND clearance.write. No single operational role possesses both permissions (Super Attendance Operator has queue.review but not clearance.write; Supervisor has clearance.write but not queue.review). Only Admin/Owner can resolve.
- Fix notes (col L): Grant queue.review to SUPERVISOR role or allow clearance.write holders to resolve machine clearance parks.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/queue-resolve.ts lines 26, 58 and src/lib/mis/permissions.ts lines 135-165. Cross-role permission deadlock blocks resolution.

## R2-343
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Plant Manager, Director / `/mis/reports/production`
- Title: Production wastage percentage formula calculates (W / P) * 100 instead of W / (P + W), reporting distorted metrics like 900% waste
- Steps: 1. Press setup run produces 10 good boxes and wastes 90 sheets. 2. Open Production Report (/mis/reports/production). 3. Inspect 'Waste %' column.
- Expected: Wastage percentage should represent waste relative to total input material: (90 / 100) * 100 = 90%.
- Actual: In reports.ts line 89, wastePct is calculated as Math.round((w / p.qty) * 1000) / 10. For 10 produced and 90 waste, system reports 900% waste. If produced is 0, wastePct displays null regardless of wastage.
- Fix notes (col L): Update waste percentage formula to (w / (p.qty + w)) * 100 in reports.ts line 89.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/reports.ts line 89. Formula divides waste by produced quantity instead of total input.

## R2-344
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: Admin, IT Manager / `/mis/items` (Item SKU Generation)
- Title: allocateItemCode loads entire database item table into memory on every SKU creation instead of database sequence
- Steps: 1. Factory catalog grows to 5,000 raw material and packaging SKUs. 2. Admin creates a new item with auto-generated code.
- Expected: System should query the highest existing code number via SQL aggregate or database sequence.
- Actual: In item-code.ts lines 9-11, allocateItemCode executes db.misItem.findMany({ select: { code: true } }), pulling all 5,000 strings into Node.js memory on every item insert, causing high latency.
- Fix notes (col L): Use a database sequence or query max item code number using Prisma orderBy: { code: 'desc' }, take: 1.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/item-code.ts line 10. findMany fetches entire table with no pagination or limit.

## R2-345
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Dispatch Officer, Owner / `/mis/orders` (Dispatch & Shipping)
- Title: Absence of Partial Dispatch, Delivery Challan, E-Way Bill, and Vehicle tracking causes immediate GST compliance exposure
- Steps: 1. Customer orders 10,000 cartons. Factory finishes 5,000 cartons today and loads delivery truck. 2. Attempt to generate Delivery Challan.
- Expected: System provides Delivery Challan generation with partial quantity, Transporter Name, Vehicle No., and E-Way Bill #.
- Actual: Order transitions directly from COMPLETED to DELIVERED with zero dispatch records. No Delivery Challan, vehicle, or partial dispatch mechanism exists, violating Rule 55 of CGST Rules and risking truck impoundment.
- Fix notes (col L): Implement MisDeliveryChallan model supporting partial dispatch quantities, transporter details, and vehicle numbers.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/lib/mis/order-transitions.ts lines 11-31 and src/server/mis/orders.ts. System has no dispatch or delivery challan infrastructure.

## R2-346
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Store Guy, Admin / `/mis/store/issue`
- Title: Unsearchable chip button layout for Orders causes vertical page bloat and slow order selection
- Steps: 1. Open /mis/store/issue. 2. Observe "Against an order" section with 50+ open production orders. 3. Attempt to quickly find order ORD-108.
- Expected: Orders should render inside a searchable Combobox dropdown (Shadcn Command + Popover) with typeahead search by Order # or Customer Name.
- Actual: Orders render as dozens of flex-wrapped TargetChip buttons, creating an overwhelming unsearchable wall of chips across the screen.
- Fix notes (col L): Replace TargetChip button container with Shadcn Popover + Command component rendering searchable order list.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/issue-screen.tsx lines 104-120. Orders render as wrapped buttons without search.

## R2-347
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Store Guy, Admin / `/mis/store/issue`
- Title: Department selection renders as static chip buttons instead of a searchable Command + Popover dropdown
- Steps: 1. Open /mis/store/issue. 2. Observe "To which department" section. 3. Attempt to search and select a specific department.
- Expected: Departments should render in a searchable Shadcn Command + Popover dropdown with clear option and keyboard arrow navigation.
- Actual: Departments are hardcoded as static chip buttons, taking excessive horizontal/vertical space and lacking searchability.
- Fix notes (col L): Refactor department selection into a Shadcn Popover + CommandInput dropdown with search and clear actions.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/issue-screen.tsx lines 83-98. Departments are rendered as TargetChip buttons.

## R2-348
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Store Guy, Admin / `/mis/store/issue`
- Title: Cost Center selector on General Use lacks searchable typeahead dropdown
- Steps: 1. Open /mis/store/issue. 2. Select "No order — General / factory use". 3. Inspect the Cost Center field.
- Expected: Cost Center should render using Shadcn Command + Popover combobox displaying code and label with real-time search.
- Actual: Cost Center renders as a basic native select element or unstyled input in general-use-fields.tsx without keyboard searchability.
- Fix notes (col L): Upgrade Cost Center selection to Shadcn Command + Popover with cost center codes and descriptions.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/general-use-fields.tsx. Cost center uses basic select dropdown.

## R2-349
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Store Guy, Admin / `/mis/store/issue`
- Title: Material issue cart displays as disjoint mobile cards instead of structured desktop Table layout
- Steps: 1. Add 8 items to the issue cart on /mis/store/issue. 2. Inspect the display layout on desktop (1440px).
- Expected: Items should be presented in a clean tabular format with headers: Code, Item Name, Available Stock, Earmarked/Left, Issue Qty, UOM, and Actions.
- Actual: Cart lines render as stacked loose card items in item-cart.tsx, making multi-line comparison and quantity adjustments cumbersome.
- Fix notes (col L): Wrap cart lines in a responsive Table with sticky header and tabular columns for desktop viewport.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx lines 200-350. Cart renders as stacked div cards rather than a table.

## R2-350
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Duplicate SKU added to cart bypasses total available stock check and corrupts running ledger balance
- Steps: 1. Item 'KRAFT-250' has 100 KG in stock. 2. Store Guy adds line 1: 60 KG. 3. Adds line 2: 60 KG (total 120 KG). 4. Click 'Issue'.
- Expected: Cart should consolidate duplicate item rows or validate aggregate item quantity (120 > 100) and block checkout.
- Actual: System evaluates each line separately against initial stock (60 <= 100), executes both deductions, and causes stock balance to drop negative.
- Fix notes (col L): Consolidate cart lines by itemId before checking balance in store.ts line 1435 and update ledgerBalances map per line.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store.ts lines 1434-1442 & 1467-1485. Balance map is static during transaction loop.

## R2-351
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Store Guy, Supervisor / `/mis/store/issue`
- Title: Entering zero or negative quantity in issue table allows empty transactions into inventory ledger
- Steps: 1. Add Item to cart on /mis/store/issue. 2. Input quantity '0' or '-10'. 3. Click 'Confirm Issue'.
- Expected: System must validate that every issue quantity is a strictly positive number (> 0) and disable checkout.
- Actual: Input accepts 0 and negative values in table; transaction commits zero-qty or negative records to misStoreTransaction.
- Fix notes (col L): Enforce input min="0.01" step="any" and validate qty > 0 in commitIssueAction before database execution.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx lines 80-84 and src/server/mis/store.ts line 1441.

## R2-352
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Issuing raw material exceeding Order BOM allocation quota passes without supervisor override
- Steps: 1. Select Order ORD-10. Approved BOM allocates 500 KG Kraft Paper (0 KG issued so far). 2. Enter Issue Qty: 800 KG. 3. Click Confirm.
- Expected: System must flag that issue exceeds order allocation (800 > 500) and require supervisor authorization or block issue.
- Actual: If total warehouse stock is 1,000 KG, stock availability check passes and issue is booked against the order past BOM quota without warning.
- Fix notes (col L): Check line.qty against allocation.remaining for selected orderId in IssueScreen and render quota exceeded badge.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/issue-screen.tsx line 128 and src/server/mis/store.ts line 1452.

## R2-353
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Shadcn Popover for Order selection fails to close when selecting "No order — General Use"
- Steps: 1. Open /mis/store/issue. 2. Open Order Popover combobox. 3. Click "No order — General / factory use".
- Expected: Popover should immediately close, focus return to trigger button, and orderId set to null.
- Actual: Popover remains open or requires clicking outside backdrop to dismiss.
- Fix notes (col L): Add setOpen(false) inside onSelect handler for the "No order" command item.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Not run
- Tester comment: Pending layout implementation of Shadcn Popover + Command combobox.

## R2-354
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Department and Cost Center Combobox lacks keyboard Esc key dismissal and Tab navigation support
- Steps: 1. Focus Department Combobox on /mis/store/issue. 2. Press Tab or Esc key.
- Expected: Popover dismisses cleanly and keyboard focus moves sequentially to Order combobox and Item search.
- Actual: Focus gets trapped inside CommandList or popover stays unmounted in DOM.
- Fix notes (col L): Configure onKeyDown listener in PopoverContent to handle Escape and Tab focus transitions.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Not run
- Tester comment: Pending layout implementation of Shadcn Popover + Command combobox.

## R2-355
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/issue`
- Title: General Use issue submitted without Cost Center succeeds on client but fails with uncaught server error
- Steps: 1. Select "No order — General use". 2. Leave Cost Center blank. 3. Enter Reason: "Machine cleaning". 4. Click "Confirm Issue".
- Expected: Client form validation should highlight Cost Center combobox as required before triggering server action.
- Actual: Client submits payload; server throws runtime error during categoryRefusal, displaying generic error card.
- Fix notes (col L): Add client-side validation in commit() requiring general.costCenter to be non-empty when orderId is null.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/issue-screen.tsx line 48 and src/lib/mis/general-use.ts.

## R2-356
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Item search in table lacks barcode scanner auto-focus and auto-add on Enter
- Steps: 1. Store Guy scans item barcode (e.g. ITM-0012) using USB handheld barcode scanner. 2. Scanner sends barcode string + Enter.
- Expected: Table should immediately add scanned item to cart with quantity 1 and refocus search input for next scan.
- Actual: Barcode text fills search input but requires manual mouse click on search result dropdown to add to table.
- Fix notes (col L): Implement onScanComplete handler in table search input to auto-append matching item on Enter key.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx lines 121-137. Manual selection click is required.

## R2-357
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Stale inventory balance displayed in table when another workstation issues stock concurrently
- Steps: 1. Terminal A opens /mis/store/issue with Item X balance = 50. 2. Terminal B issues 40 of Item X. 3. Terminal A types 30 in table.
- Expected: Table should display out-of-date stock warning or auto-refresh available balance on window focus.
- Actual: Terminal A table still shows balance 50, lets user type 30, and only errors out on final submission.
- Fix notes (col L): Trigger refreshBalances() on window focus and display live balance refresh timestamp in table header.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx lines 106-116. Balances do not poll or refresh on blur/focus.

## R2-358
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Supervisor / `/mis/store/issue`
- Title: Supervisor role accessing /mis/store/issue is presented with dead-end screen instead of redirecting to Material Request
- Steps: 1. User with role SUPERVISOR navigates to /mis/store/issue. 2. Observe displayed screen.
- Expected: Page should clearly explain that supervisors must raise a Material Request and provide a prominent "Raise Material Request" button.
- Actual: Page renders RaiseRequestInstead component with broken back-navigation and no direct link to /mis/store/requests/new.
- Fix notes (col L): Add direct primary action button linking to /mis/store/requests/new on RaiseRequestInstead component.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/app/(mis)/mis/store/issue/page.tsx line 20 and RaiseRequestInstead component.

## R2-359
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Rapid double-click on 'Confirm Issue' button submits duplicate stock issues to database
- Steps: 1. Add 5 items to table. 2. Double-click or rapidly click "Confirm Issue" button.
- Expected: Button should disable immediately on first click with spinner; transaction must be idempotent via UUID key.
- Actual: If network latency delays first response, second click generates a second transaction with identical quantities.
- Fix notes (col L): Disable confirm button when isPending is true and ensure commitKey is generated once per form lifecycle.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx line 110. Double click can trigger race condition.

## R2-360
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Table row quantity input accepts non-numeric scientific notation ('1e5') causing NaN stock calculations
- Steps: 1. Add item to table. 2. Type '1e5' or '10..5' into quantity cell. 3. Observe calculated total and available stock.
- Expected: Table input should sanitize characters, restricting to valid decimal format and rejecting exponent characters.
- Actual: Input accepts scientific notation, resulting in NaN line totals and unexpected server-side parse failures.
- Fix notes (col L): Add regex pattern validation /^\d+(\.\d{1,2})?$/ on quantity input change handler in table.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx lines 80-84. Plain string input is parsed as Number().

## R2-361
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy, Accounts / `/mis/store/issue`
- Title: Issuing stock to closed or cancelled order passes client validation and only fails at final database commit
- Steps: 1. Open /mis/store/issue. 2. Select an order that was completed or cancelled earlier today. 3. Fill cart and click Confirm.
- Expected: Searchable Order combobox should filter out closed, completed, and cancelled orders from the selection list.
- Actual: Closed orders appear in targets.orders list; user spends time building a 10-line cart only to receive a rejection on submit.
- Fix notes (col L): Filter targets.orders in listIssueTargets() with status: { notIn: ['COMPLETED', 'DELIVERED', 'CANCELLED'] }.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store.ts and src/app/(mis)/mis/store/issue/page.tsx line 23.

## R2-362
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Table lacks 'Clear All Items' action, forcing manual one-by-one row deletion on large cart resets
- Steps: 1. Add 12 items to issue table. 2. Realize wrong department was selected and need to start over.
- Expected: Table header should include a "Clear Cart" button with confirmation prompt to reset all rows in one click.
- Actual: Store Guy must manually click the remove icon on all 12 individual rows one by one.
- Fix notes (col L): Add a "Clear All" button in table header toolbar that calls setLines([]) with user confirmation.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx. Only individual row removal exists.

## R2-363
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/returns`
- Title: Store return submitted for material not previously issued against order is accepted into inventory
- Steps: 1. Open /mis/store/returns. 2. Select Order ORD-10. 3. Select Item B (which was never issued to ORD-10). 4. Record return of 100 KG.
- Expected: System should validate return against historical issues for that order and block returns of non-issued items.
- Actual: Return is accepted without checking order issue history, artificially inflating store stock balance.
- Fix notes (col L): In createStoreReturn, verify item was issued to orderId and cumulative returned <= cumulative issued.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store-return.ts lines 45-70. No validation against historical order issues.

## R2-364
- Type: Bug | Status: New Bug | Severity: Blocker
- Role/screen: Store Guy / `/mis/store/requests`
- Title: Fulfilling a Material Request via Store Issue does not link materialRequestId, leaving request open
- Steps: 1. Supervisor submits Material Request REQ-100. 2. Store Guy fulfills it via /mis/store/issue. 3. View /mis/store/requests.
- Expected: Material request status should transition to FULFILLED and link to the generated store transaction number.
- Actual: Transaction is created with materialRequestId: null; request remains in APPROVED status indefinitely.
- Fix notes (col L): Pass materialRequestId through commitIssueAction and update MisMaterialRequest status to FULFILLED.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store.ts line 1493 and src/components/mis/store/issue-screen.tsx.

## R2-365
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy / `/mis/store/pick-lists`
- Title: Staging items on a Pick List does not reserve inventory, allowing double-issue from /mis/store/issue
- Steps: 1. Pick List created for Order A staging 200 KG paper. 2. Another user opens /mis/store/issue and issues remaining 200 KG to Order B.
- Expected: Staged pick list items must deduct from available issue balance to prevent physical stockouts.
- Actual: Available balance only checks ledger balance; unissued pick list items are not reserved, causing physical shortfall.
- Fix notes (col L): Deduct active unissued pick list item quantities from available stock in lastLedgerBalance / lastTxnBalance.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/pick-list.ts and src/server/mis/store.ts lines 1435-1440.

## R2-366
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Table column headers lack sort toggles by Stock Balance and Item Name
- Steps: 1. Issue cart has 15 rows. 2. Store Guy wants to verify lowest stock items first before confirming.
- Expected: Table headers (Item Name, Balance, Issue Qty) should support ascending/descending sort.
- Actual: Table rows are fixed in the order they were added, with no sorting or filtering capability.
- Fix notes (col L): Add client-side sorting state on table columns in ItemCart component.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx. Table rows lack sorting controls.

## R2-367
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Store Guy, Auditor / `/mis/store/transactions`
- Title: Store issue transaction notes field truncates general use descriptions exceeding 60 characters
- Steps: 1. Issue stock with General Use reason: "Emergency repair of offset printing cylinder bearing unit". 2. View /mis/store/transactions.
- Expected: Full audit reason should be stored and displayed in transaction ledger history.
- Actual: Transaction notes column is truncated to 40-60 characters, losing essential maintenance justification.
- Fix notes (col L): Ensure reason column on MisStoreTransaction accommodates up to 255 characters and renders full text in table.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/server/mis/store.ts line 1487 and transaction view component.

## R2-368
- Type: Bug | Status: New Bug | Severity: Minor
- Role/screen: Store Guy / `/mis/store/issue`
- Title: Table input focus lost after tapping '+' increment button on mobile view
- Steps: 1. On mobile tablet, add item to table. 2. Tap '+' button to increment quantity from 1 to 2.
- Expected: Quantity cell should update and retain focus without shifting scroll position or closing virtual keyboard.
- Actual: Tapping '+' causes entire row to re-render, un-focusing the input and hiding the mobile number pad.
- Fix notes (col L): Use uncontrolled input or preserve input ref across state updates in table row component.
- Device: Mobile / Kiosk | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/store/item-cart.tsx lines 250-280. Re-render drops focus.

## R2-369
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Attendance Operator, Admin / `/mis/attendance?view=classic`
- Title: Attendance Edit modal leaves Clock Out input blank instead of auto-filling assigned shift endTime
- Steps: 1. Assign worker to Morning Shift (06:00–15:00). 2. Worker clocks in at 06:00. 3. Open /mis/attendance?view=classic. 4. Click "Edit" on worker row.
- Expected: Clock Out input field should automatically pre-fill with the assigned shift endTime ('15:00'), allowing user to edit if actual exit differed.
- Actual: editOut state initializes to empty string ('') via toTimeInput(r.clockOut, timeZone). Operators must manually type '15:00' for every single employee.
- Fix notes (col L): In openEdit, set default editOut to r.shift?.endTime when r.clockOut is null, allowing operator override.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/attendance/attendance-screen.tsx line 136. editOut is set to '' when clockOut is null.

## R2-370
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Attendance Operator, Admin / `/mis/attendance?view=classic`
- Title: Clock Out time does not dynamically auto-calculate from Clock In using shift duration (e.g. 9h shift)
- Steps: 1. Worker assigned to 9-hour shift (06:00 to 15:00). 2. Operator opens Edit modal and adjusts Clock In to 06:15. 3. Inspect Clock Out field.
- Expected: Clock Out field should dynamically auto-compute to 15:15 (Clock In + 9 hours shift duration) while keeping field editable.
- Actual: Clock Out remains static or blank. Changing Clock In does not trigger automatic recalculation of the expected exit timestamp.
- Fix notes (col L): Add onChange listener to editIn that calculates editOut = addMinutes(editIn, shiftDurationMinutes(shift)) if editOut is unmodified.
- Device: Desktop / Mobile | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/attendance/attendance-screen.tsx line 275. editIn and editOut are completely decoupled.

## R2-371
- Type: Enhancement | Status: New Bug | Severity: Major
- Role/screen: Attendance Operator / `/mis/attendance?view=classic` (Bulk Clock Out)
- Title: Bulk Clock Out SlideOver leaves Time field blank instead of auto-populating selected shift endTime
- Steps: 1. Select 20 employees on /mis/attendance?view=classic. 2. Click "Bulk Clock Out". 3. Select Shift: 'Morning Shift (06:00–15:00)'.
- Expected: TimeInput should automatically default to the selected shift's endTime ('15:00').
- Actual: punchTime input stays blank (''). Operator must manually type '15:00' every time before saving bulk exit punches.
- Fix notes (col L): When punchShift changes in punch SlideOver, auto-populate punchTime with shifts.find(s => s.id === punchShift)?.endTime.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/attendance/attendance-screen.tsx lines 290-298. punchTime is unlinked from shift selection.

## R2-372
- Type: Bug | Status: New Bug | Severity: Major
- Role/screen: Attendance Operator, Supervisor / `/mis/attendance?view=classic`
- Title: Overnight night-shift (wrap past midnight) end time calculation fails on day boundary
- Steps: 1. Worker on Night Shift (22:00 to 06:00, 8 hours). 2. Operator edits attendance and enters Clock In 22:30. 3. System computes Clock Out.
- Expected: System should correctly wrap past 24:00 and auto-fill Clock Out as 06:30 next morning.
- Actual: Without modular arithmetic (% 1440), time string addition produces invalid time strings (e.g. '30:30') or negative hour values.
- Fix notes (col L): Use modular minute addition: toHHMM((timeToMinutes(inTime) + duration) % 1440) to handle night shift midnight wraps.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/attendance/attendance-screen.tsx. No midnight-wrap helper exists in UI edit state.

## R2-373
- Type: Enhancement | Status: New Bug | Severity: Minor
- Role/screen: Attendance Operator / `/mis/attendance?view=classic`
- Title: Clock In on unrecorded past date does not offer 'Standard Full Day (Shift In & Out)' one-click fill
- Steps: 1. Open /mis/attendance?view=classic on a past date. 2. Row shows unrecorded employee. 3. Click "Clock In".
- Expected: SlideOver should offer a one-click button: "Standard Shift (06:00 – 15:00)" to record both entry and exit punches simultaneously.
- Actual: Operator must navigate separate Clock In modal, manually type 06:00, then click Edit, and manually type 15:00 in two distinct workflows.
- Fix notes (col L): Add a "Full Shift Punch" toggle in past punch modal to record both shift.startTime and shift.endTime in a single action.
- Device: Desktop / Web | Round: round 2 | Build: commit 7633928 | Tester result: Fail
- Tester comment: WHY FAIL: Confirmed in src/components/mis/attendance/attendance-screen.tsx lines 176 & 287-305. Past punch only accepts single direction.
