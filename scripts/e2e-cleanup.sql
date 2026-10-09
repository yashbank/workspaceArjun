-- MIS coverage run (2026-10-09/10) — remove every record the automated tests created.
-- Everything the suite writes is prefixed 'E2E-' (name, code, reason, note or parameter), so this
-- touches nothing a person entered. Run once in the Supabase SQL editor; re-running is harmless.
BEGIN;

-- Material requests raised/rejected by the suite (lines first, then the notes, then their bell rows)
DELETE FROM mis_material_request_lines
 WHERE request_id IN (SELECT id FROM mis_material_requests
                       WHERE decision_note LIKE 'E2E-%' OR notes LIKE 'E2E-%'
                          OR request_number IN ('MRN-202610-58882','MRN-202610-75277','MRN-202610-54240','MRN-202610-45384'));
DELETE FROM notifications
 WHERE type LIKE 'mis.material_request.%'
   AND payload->>'requestNumber' IN (SELECT request_number FROM mis_material_requests
                                      WHERE decision_note LIKE 'E2E-%' OR notes LIKE 'E2E-%'
                                         OR request_number IN ('MRN-202610-58882','MRN-202610-75277','MRN-202610-54240','MRN-202610-45384'));
DELETE FROM mis_material_requests
 WHERE decision_note LIKE 'E2E-%' OR notes LIKE 'E2E-%'
    OR request_number IN ('MRN-202610-58882','MRN-202610-75277','MRN-202610-54240','MRN-202610-45384');

-- Leave requests, QC checks, QC templates, customers
DELETE FROM mis_leave_requests WHERE reason LIKE 'E2E-%';
DELETE FROM mis_qc_checks WHERE parameter_name = 'E2E-check' OR notes LIKE 'E2E %';
DELETE FROM mis_qc_templates WHERE name LIKE 'E2E-template-%';
DELETE FROM mis_customers WHERE code LIKE 'E2E-%' OR name = 'E2E-customer';

COMMIT;

-- verify (all should be 0):
-- SELECT (SELECT count(*) FROM mis_customers WHERE code LIKE 'E2E-%') AS customers,
--        (SELECT count(*) FROM mis_qc_templates WHERE name LIKE 'E2E-template-%') AS templates,
--        (SELECT count(*) FROM mis_leave_requests WHERE reason LIKE 'E2E-%') AS leaves,
--        (SELECT count(*) FROM mis_qc_checks WHERE parameter_name = 'E2E-check') AS qc_checks,
--        (SELECT count(*) FROM mis_material_requests WHERE decision_note LIKE 'E2E-%' OR notes LIKE 'E2E-%') AS requests;

-- ---------------------------------------------------------------------------------------------
-- e2e/v2-flows.spec.ts (2026-10-10 onward) — the seeded order → PO → GRN → issue → MRN chain.
-- Generic sweep by the 'E2E-flow' marker (covers a run that died half-way); every completed run
-- also appends its own numbered block below. Ledger balance_qty is a running figure, so deleting
-- ledger rows leaves later balances as they were — acceptable for test items, never run on real ones.
BEGIN;
DELETE FROM mis_order_stock_allocations
 WHERE order_id IN (SELECT id FROM mis_orders WHERE description LIKE 'E2E-flow order%');
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM mis_orders WHERE description LIKE 'E2E-flow order%')
    OR source_id IN (SELECT id::text FROM mis_grns WHERE notes LIKE 'E2E-flow%');
DELETE FROM mis_store_transactions
 WHERE reference_no IN (SELECT order_number FROM mis_orders WHERE description LIKE 'E2E-flow order%');
DELETE FROM notifications
 WHERE payload->>'grnNumber' IN (SELECT grn_number FROM mis_grns WHERE notes LIKE 'E2E-flow%')
    OR payload->>'orderNumber' IN (SELECT order_number FROM mis_orders WHERE description LIKE 'E2E-flow order%');
DELETE FROM mis_material_request_lines
 WHERE request_id IN (SELECT id FROM mis_material_requests
                       WHERE decision_note LIKE 'E2E-flow%'
                          OR order_id IN (SELECT id FROM mis_orders WHERE description LIKE 'E2E-flow order%'));
DELETE FROM mis_material_requests
 WHERE decision_note LIKE 'E2E-flow%'
    OR order_id IN (SELECT id FROM mis_orders WHERE description LIKE 'E2E-flow order%');
DELETE FROM mis_supplier_invoices WHERE invoice_no LIKE 'E2E-INV-%';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM mis_grns WHERE notes LIKE 'E2E-flow%');
DELETE FROM mis_grns WHERE notes LIKE 'E2E-flow%';
DELETE FROM mis_po_items WHERE po_id IN (SELECT id FROM mis_purchase_orders WHERE notes LIKE 'E2E-flow%');
DELETE FROM mis_purchase_orders WHERE notes LIKE 'E2E-flow%';
-- ORD-202610-53775: confirmed by the first (aborted) run before any PO/GRN existed — covered here.
DELETE FROM mis_orders WHERE description LIKE 'E2E-flow order%';
COMMIT;

-- v2-flows run MV1J92G3 (2026-10-09T22:24:24.483Z → 2026-10-09T22:25:16.600Z):
--   ORD-202610-67207 · PO-202610-70057 · GRN-202610-75307 · E2E-INV-MV1J92G3 · MRN-202610-07771 · MRN-202610-12858 · item ITEM-001
BEGIN;
DELETE FROM notifications WHERE payload->>'grnNumber' = 'GRN-202610-75307' OR payload->>'requestNumber' IN ('MRN-202610-07771','MRN-202610-12858');
DELETE FROM mis_material_request_lines WHERE request_id IN (SELECT id FROM mis_material_requests WHERE request_number IN ('MRN-202610-07771','MRN-202610-12858'));
DELETE FROM mis_material_requests WHERE request_number IN ('MRN-202610-07771','MRN-202610-12858');
DELETE FROM mis_store_transactions WHERE reference_no = 'ORD-202610-67207' OR reason LIKE 'MRN-202610-07771%' OR reason LIKE 'MRN-202610-12858%';
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM mis_orders WHERE order_number = 'ORD-202610-67207')
    OR source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-75307')
    OR (source = 'STORE_ISSUE' AND source_id IS NULL AND created_at BETWEEN '2026-10-09T22:24:24.483Z' AND '2026-10-09T22:25:16.600Z'
        AND item_id IN (SELECT id FROM mis_items WHERE code = 'ITEM-001'));
DELETE FROM mis_order_stock_allocations WHERE source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-75307');
DELETE FROM mis_supplier_invoices WHERE invoice_no = 'E2E-INV-MV1J92G3';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM mis_grns WHERE grn_number = 'GRN-202610-75307');
DELETE FROM mis_grns WHERE grn_number = 'GRN-202610-75307';
DELETE FROM mis_po_items WHERE po_id IN (SELECT id FROM mis_purchase_orders WHERE po_number = 'PO-202610-70057');
DELETE FROM mis_purchase_orders WHERE po_number = 'PO-202610-70057';
DELETE FROM mis_orders WHERE order_number = 'ORD-202610-67207';
COMMIT;

-- v2-flows run MV1JF8SL (2026-10-09T22:29:12.645Z → 2026-10-09T22:30:12.659Z):
--   ORD-202610-55449 · PO-202610-57089 · GRN-202610-62398 · E2E-INV-MV1JF8SL · MRN-202610-00595 · MRN-202610-08923 · item ITEM-001
BEGIN;
DELETE FROM notifications WHERE payload->>'grnNumber' = 'GRN-202610-62398' OR payload->>'requestNumber' IN ('MRN-202610-00595','MRN-202610-08923');
DELETE FROM mis_material_request_lines WHERE request_id IN (SELECT id FROM mis_material_requests WHERE request_number IN ('MRN-202610-00595','MRN-202610-08923'));
DELETE FROM mis_material_requests WHERE request_number IN ('MRN-202610-00595','MRN-202610-08923');
DELETE FROM mis_store_transactions WHERE reference_no = 'ORD-202610-55449' OR reason LIKE 'MRN-202610-00595%' OR reason LIKE 'MRN-202610-08923%';
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM mis_orders WHERE order_number = 'ORD-202610-55449')
    OR source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-62398')
    OR (source = 'STORE_ISSUE' AND source_id IS NULL AND created_at BETWEEN '2026-10-09T22:29:12.645Z' AND '2026-10-09T22:30:12.659Z'
        AND item_id IN (SELECT id FROM mis_items WHERE code = 'ITEM-001'));
DELETE FROM mis_order_stock_allocations WHERE source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-62398');
DELETE FROM mis_supplier_invoices WHERE invoice_no = 'E2E-INV-MV1JF8SL';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM mis_grns WHERE grn_number = 'GRN-202610-62398');
DELETE FROM mis_grns WHERE grn_number = 'GRN-202610-62398';
DELETE FROM mis_po_items WHERE po_id IN (SELECT id FROM mis_purchase_orders WHERE po_number = 'PO-202610-57089');
DELETE FROM mis_purchase_orders WHERE po_number = 'PO-202610-57089';
DELETE FROM mis_orders WHERE order_number = 'ORD-202610-55449';
COMMIT;

-- v2-flows run MV1JJG4D (2026-10-09T22:32:28.765Z → 2026-10-09T22:34:13.891Z):
--   ORD-202610-52867 · PO-202610-55839 · GRN-202610-62485 · E2E-INV-MV1JJG4D · MRN-202610-21726 · MRN-202610-50169 · item ITEM-001
BEGIN;
DELETE FROM notifications WHERE payload->>'grnNumber' = 'GRN-202610-62485' OR payload->>'requestNumber' IN ('MRN-202610-21726','MRN-202610-50169');
DELETE FROM mis_material_request_lines WHERE request_id IN (SELECT id FROM mis_material_requests WHERE request_number IN ('MRN-202610-21726','MRN-202610-50169'));
DELETE FROM mis_material_requests WHERE request_number IN ('MRN-202610-21726','MRN-202610-50169');
DELETE FROM mis_store_transactions WHERE reference_no = 'ORD-202610-52867' OR reason LIKE 'MRN-202610-21726%' OR reason LIKE 'MRN-202610-50169%';
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM mis_orders WHERE order_number = 'ORD-202610-52867')
    OR source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-62485')
    OR (source = 'STORE_ISSUE' AND source_id IS NULL AND created_at BETWEEN '2026-10-09T22:32:28.765Z' AND '2026-10-09T22:34:13.891Z'
        AND item_id IN (SELECT id FROM mis_items WHERE code = 'ITEM-001'));
DELETE FROM mis_order_stock_allocations WHERE source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-62485');
DELETE FROM mis_supplier_invoices WHERE invoice_no = 'E2E-INV-MV1JJG4D';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM mis_grns WHERE grn_number = 'GRN-202610-62485');
DELETE FROM mis_grns WHERE grn_number = 'GRN-202610-62485';
DELETE FROM mis_po_items WHERE po_id IN (SELECT id FROM mis_purchase_orders WHERE po_number = 'PO-202610-55839');
DELETE FROM mis_purchase_orders WHERE po_number = 'PO-202610-55839';
DELETE FROM mis_orders WHERE order_number = 'ORD-202610-52867';
COMMIT;
