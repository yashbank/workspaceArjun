# Message to the tester — send after round 6B is deployed

Fill in `<build id>` and strike any decision the build did not end up implementing before sending.

---

Hi, the fixes for R2-234 to R2-283 are live (build `<build id>`). Please retest every row in the Bugs tab with status "Fixed - Ready to Retest".

**How to retest**
1. Use the Fix notes column for what changed. Rows with a "DECISION:" prefix show a business rule we agreed on; retest against that rule, not the old expectation.
2. Follow your original steps on the device in the Device column.
3. Set "Retest by tester" to Pass or Fail. For a Fail, add a short comment with what you saw.

**Decisions we made (please test against these)**
- Leave (R2-240, 261): a Worker or Admin may cancel an approved leave while its start date is still in the future.
- Onboarding (R2-250): only the Owner chooses pay type and wage code; Admin sees a friendly message.
- Closed payroll month (R2-256): the Owner may edit attendance with a reason and the payroll screen shows a drift banner; other roles are refused.
- Shift roster (R2-263): Supervisors can now manage the roster.
- Orders: quantity is mandatory (units: pieces, kg, reams) and production completes only when produced is at least ordered (R2-264); Customer PO number is optional and prints when present (R2-265); reopening an order only warns that reservations were cleared (R2-266); Start Production needs an approved BOM, Owner can override with a reason (R2-267).
- BOM: quantities are per finished unit (R2-268); submit is blocked while a material has no catalogue item (R2-269); a stage is complete with at least one material (R2-270).
- Purchase orders: payment terms from a fixed list and delivery date mandatory (R2-272); Admin cannot enter purchase rates (R2-273); duplicate PO for the same BOM material warns, not blocks (R2-274); cancelling a PO discards its draft GRNs (R2-275); a PO line unit that differs from the item unit is rejected (R2-276).
- GRN and invoices: only the Owner can reverse a confirmed GRN, which also reopens the PO (R2-277); damaged stock goes to a Quarantine location and the Owner returns it to the supplier (R2-278); over-receipt above 5% and any discrepancy invoice need Owner sign-off, with no debit note this round (R2-279, 280).
- Store: the Storekeeper can view BOM materials and quantities but never prices (R2-282); if stock moved during a count, the reconcile recomputes against the live balance (R2-283).

Rows R2-244 to R2-260 already marked "Bug Reproduced" and duplicates (e.g. 234 = 247) are fixed together; the Fix notes say which.

Thanks!
