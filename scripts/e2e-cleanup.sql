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
