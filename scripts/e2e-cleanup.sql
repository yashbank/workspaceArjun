-- MIS automated-test cleanup — run once in the Supabase SQL editor (plain Run). Re-running is harmless.
-- Removes every record the Playwright suites created (all carry an 'E2E' marker or are listed
-- below), deleting child rows before parents so no foreign key is violated.
BEGIN;

-- 1. The test orders: by marker, plus every order number the chain runs reported.
CREATE TEMP TABLE e2e_orders ON COMMIT DROP AS
  SELECT id, order_number FROM mis_orders
   WHERE description LIKE 'E2E-flow order%'
      OR order_number IN ('ORD-202610-67207','ORD-202610-55449','ORD-202610-52867','ORD-202610-53775',
                          'ORD-202610-55756','ORD-202610-91241','ORD-202610-01326','ORD-202610-26800',
                          'ORD-202610-01544','ORD-202610-13956','ORD-202610-82653','ORD-202610-17512',
                          'ORD-202610-16205');

-- 2. Their purchase orders and GRNs (From-BOM POs whose BOM ref is the test order number, or marked notes).
CREATE TEMP TABLE e2e_pos ON COMMIT DROP AS
  SELECT id FROM mis_purchase_orders
   WHERE notes LIKE 'E2E-flow%' OR bom_ref IN (SELECT order_number FROM e2e_orders);
CREATE TEMP TABLE e2e_grns ON COMMIT DROP AS
  SELECT id, grn_number FROM mis_grns WHERE notes LIKE 'E2E-flow%' OR po_id IN (SELECT id FROM e2e_pos);

-- 3. Order dependents, children first.
DELETE FROM mis_bom_materials WHERE stage_id IN (SELECT s.id FROM mis_bom_stages s JOIN mis_bom b ON s.bom_id = b.id WHERE b.order_id IN (SELECT id FROM e2e_orders));
DELETE FROM mis_bom_stages    WHERE bom_id IN (SELECT id FROM mis_bom WHERE order_id IN (SELECT id FROM e2e_orders));
DELETE FROM mis_bom           WHERE order_id IN (SELECT id FROM e2e_orders);
DELETE FROM mis_worker_allocations WHERE machine_allocation_id IN (SELECT id FROM mis_machine_allocations WHERE order_id IN (SELECT id FROM e2e_orders));
DELETE FROM mis_machine_allocations WHERE order_id IN (SELECT id FROM e2e_orders);
DELETE FROM mis_line_clearances WHERE order_id IN (SELECT id FROM e2e_orders);
DELETE FROM mis_job_phases      WHERE order_id IN (SELECT id FROM e2e_orders);
DELETE FROM mis_production_log  WHERE order_id IN (SELECT id FROM e2e_orders);
DELETE FROM mis_documents       WHERE order_id IN (SELECT id FROM e2e_orders);
DELETE FROM mis_qc_checks       WHERE order_id IN (SELECT id FROM e2e_orders) OR parameter_name = 'E2E-check' OR notes LIKE 'E2E %';
DELETE FROM mis_order_stock_allocations WHERE order_id IN (SELECT id FROM e2e_orders);

-- 4. Material requests (any test marker, or against a test order).
DELETE FROM mis_material_request_lines
 WHERE request_id IN (SELECT id FROM mis_material_requests
                       WHERE decision_note LIKE 'E2E%' OR notes LIKE 'E2E%'
                          OR order_id IN (SELECT id FROM e2e_orders)
                          OR request_number IN ('MRN-202610-58882','MRN-202610-75277','MRN-202610-54240','MRN-202610-45384'));
DELETE FROM mis_material_requests
 WHERE decision_note LIKE 'E2E%' OR notes LIKE 'E2E%'
    OR order_id IN (SELECT id FROM e2e_orders)
    OR request_number IN ('MRN-202610-58882','MRN-202610-75277','MRN-202610-54240','MRN-202610-45384');

-- 5. Stock movements written by the test receipts/issues (ledger rows keyed by GRN id / order id, store book by reference).
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM e2e_grns) OR source_id IN (SELECT id::text FROM e2e_orders);
DELETE FROM mis_store_transactions
 WHERE reference_no IN (SELECT grn_number FROM e2e_grns) OR reference_no IN (SELECT order_number FROM e2e_orders);

-- 6. GRNs, invoices, POs, then the orders.
DELETE FROM mis_supplier_invoices WHERE grn_id IN (SELECT id FROM e2e_grns) OR po_id IN (SELECT id FROM e2e_pos) OR invoice_no LIKE 'E2E-%';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM e2e_grns);
DELETE FROM mis_grns      WHERE id IN (SELECT id FROM e2e_grns);
DELETE FROM mis_po_items  WHERE po_id IN (SELECT id FROM e2e_pos);
DELETE FROM mis_purchase_orders WHERE id IN (SELECT id FROM e2e_pos);
DELETE FROM mis_orders    WHERE id IN (SELECT id FROM e2e_orders);

-- 7. Bell rows about any of the above, and the other suites' records.
DELETE FROM notifications
 WHERE type LIKE 'mis.%'
   AND (payload->>'grnNumber' LIKE 'GRN-%' AND payload->>'grnNumber' NOT IN (SELECT grn_number FROM mis_grns)
        OR payload->>'requestNumber' LIKE 'MRN-%' AND payload->>'requestNumber' NOT IN (SELECT request_number FROM mis_material_requests));
DELETE FROM mis_leave_requests WHERE reason LIKE 'E2E-%';
DELETE FROM mis_qc_templates   WHERE name LIKE 'E2E-template-%';
DELETE FROM mis_customers      WHERE code LIKE 'E2E-%' OR name = 'E2E-customer';

COMMIT;

-- verify (all 0):
-- SELECT (SELECT count(*) FROM mis_orders WHERE description LIKE 'E2E-flow order%') AS orders,
--        (SELECT count(*) FROM mis_customers WHERE code LIKE 'E2E-%') AS customers,
--        (SELECT count(*) FROM mis_qc_templates WHERE name LIKE 'E2E-template-%') AS templates,
--        (SELECT count(*) FROM mis_leave_requests WHERE reason LIKE 'E2E-%') AS leaves,
--        (SELECT count(*) FROM mis_material_requests WHERE decision_note LIKE 'E2E%' OR notes LIKE 'E2E%') AS requests;

-- v2-flows run MV2IB6MT (2026-10-10T14:45:49.781Z → 2026-10-10T14:47:35.635Z):
--   ORD-202610-53687 · PO-202610-56395 · GRN-202610-63302 · E2E-INV-MV2IB6MT · MRN-202610-23655 · MRN-202610-51845 · item ITEM-001
BEGIN;
DELETE FROM notifications WHERE payload->>'grnNumber' = 'GRN-202610-63302' OR payload->>'requestNumber' IN ('MRN-202610-23655','MRN-202610-51845');
DELETE FROM mis_material_request_lines WHERE request_id IN (SELECT id FROM mis_material_requests WHERE request_number IN ('MRN-202610-23655','MRN-202610-51845'));
DELETE FROM mis_material_requests WHERE request_number IN ('MRN-202610-23655','MRN-202610-51845');
DELETE FROM mis_store_transactions WHERE reference_no = 'ORD-202610-53687' OR reason LIKE 'MRN-202610-23655%' OR reason LIKE 'MRN-202610-51845%';
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM mis_orders WHERE order_number = 'ORD-202610-53687')
    OR source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-63302')
    OR (source = 'STORE_ISSUE' AND source_id IS NULL AND created_at BETWEEN '2026-10-10T14:45:49.781Z' AND '2026-10-10T14:47:35.635Z'
        AND item_id IN (SELECT id FROM mis_items WHERE code = 'ITEM-001'));
DELETE FROM mis_order_stock_allocations WHERE source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-63302');
DELETE FROM mis_supplier_invoices WHERE invoice_no = 'E2E-INV-MV2IB6MT';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM mis_grns WHERE grn_number = 'GRN-202610-63302');
DELETE FROM mis_grns WHERE grn_number = 'GRN-202610-63302';
DELETE FROM mis_po_items WHERE po_id IN (SELECT id FROM mis_purchase_orders WHERE po_number = 'PO-202610-56395');
DELETE FROM mis_purchase_orders WHERE po_number = 'PO-202610-56395';
DELETE FROM mis_orders WHERE order_number = 'ORD-202610-53687';
COMMIT;

-- v2-flows run MV2IJA5Z (2026-10-10T14:52:07.607Z → 2026-10-10T14:53:38.796Z):
--   ORD-202610-31806 · PO-202610-34633 · GRN-202610-41471 · E2E-INV-MV2IJA5Z · MRN-202610-07004 · MRN-202610-15068 · item ITEM-001
BEGIN;
DELETE FROM notifications WHERE payload->>'grnNumber' = 'GRN-202610-41471' OR payload->>'requestNumber' IN ('MRN-202610-07004','MRN-202610-15068');
DELETE FROM mis_material_request_lines WHERE request_id IN (SELECT id FROM mis_material_requests WHERE request_number IN ('MRN-202610-07004','MRN-202610-15068'));
DELETE FROM mis_material_requests WHERE request_number IN ('MRN-202610-07004','MRN-202610-15068');
DELETE FROM mis_store_transactions WHERE reference_no = 'ORD-202610-31806' OR reason LIKE 'MRN-202610-07004%' OR reason LIKE 'MRN-202610-15068%';
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM mis_orders WHERE order_number = 'ORD-202610-31806')
    OR source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-41471')
    OR (source = 'STORE_ISSUE' AND source_id IS NULL AND created_at BETWEEN '2026-10-10T14:52:07.607Z' AND '2026-10-10T14:53:38.796Z'
        AND item_id IN (SELECT id FROM mis_items WHERE code = 'ITEM-001'));
DELETE FROM mis_order_stock_allocations WHERE source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = 'GRN-202610-41471');
DELETE FROM mis_supplier_invoices WHERE invoice_no = 'E2E-INV-MV2IJA5Z';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM mis_grns WHERE grn_number = 'GRN-202610-41471');
DELETE FROM mis_grns WHERE grn_number = 'GRN-202610-41471';
DELETE FROM mis_po_items WHERE po_id IN (SELECT id FROM mis_purchase_orders WHERE po_number = 'PO-202610-34633');
DELETE FROM mis_purchase_orders WHERE po_number = 'PO-202610-34633';
DELETE FROM mis_orders WHERE order_number = 'ORD-202610-31806';
COMMIT;
