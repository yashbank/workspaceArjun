# Message to the tester: send after round 6C is deployed

Fill in `<build id>` and strike any decision the build did not end up implementing before sending.

---

Hi, the fixes for R2-284 to R2-295 and R2-308 to R2-373 are live (build `<build id>`). Please retest every row in the Bugs tab with status "Fixed - Ready to Retest". (The sheet has no R2-296 to R2-307.)

**How to retest**
1. Use the Fix notes column for what changed. Rows with a "DECISION:" prefix show a business rule we agreed on; retest against that rule, not the old expectation.
2. Follow your original steps on the device in the Device column.
3. Set "Retest by tester" to Pass or Fail. For a Fail, add a short comment with what you saw.

**Decisions we made (please test against these)**
- Fill from `R2_ROUND6C_DECISIONS.md`, one bullet per decision, grouped like 6B (Store, QC and CoA, Permissions, Attendance, Money). Strike rows not built.

Rows already working before this round (e.g. R2-340, R2-341, R2-326, R2-350) will say "already fixed" in Fix notes; please just confirm.

Duplicates fixed together: 326 = 350, 287 = 365, 369 = 370 = 371.

Thanks!

**Decisions we made (test against these)**
- R2-286: Add a "Partially issued" status; the unfulfilled balance stays open.
- R2-287 / R2-365: Staging a pick list holds the stock until handover; it is released on cancel.
- R2-288: Supplier invoice states: Approved for payment (Owner sets it), Paid with date and UTR (Accounts or Owner), Rejected.
- R2-308: A SHIFT clearance made outside a shift lasts 8 hours.
- R2-309: A JOB clearance with no order booked is refused; the user is asked to use SHIFT mode.
- R2-311: The QC role may acknowledge QC failures and waivers, and only that action.
- R2-314: Separate Major (1.5) and Minor (4.0) AQL limits in Settings.
- R2-315: The CoA summary shows unresolved failures only.
- R2-316: CoA lot number is the order number; manufacturing date is the production completion date.
- R2-324: The factory deducts PF, ESIC, PT and advances; the bank file shows net pay.
- R2-325: The invoice has an optional GST %; matching compares the amount excluding GST.
- R2-330: Admin or Owner may sign off a phase without being in-charge, with a reason, audited.
- R2-331: Admin may reopen a signed phase, with a reason.
- R2-332: Supervisors may be booked as machine crew.
- R2-333: Crew booking for past shifts: Admin or Owner only, up to 3 days back, with a reason.
- R2-334: Lot tracking this round: a lot number on goods receipt, shown in traceability only.
- R2-336: Item delete is blocked when stock is above zero or the item is in an approved BOM; re-using the code restores the old item.
- R2-337: A roster overlap auto-cuts the old entry after confirmation; history is kept.
- R2-338: A CoA may be approved from IN_PRODUCTION status onwards.
- R2-342: Supervisor gets queue.review to resolve parked offline-queue entries.
- R2-345: DEFERRED by owner: dispatch is out of scope this round. Log DEFERRED_BY_OWNER, do not build.
- R2-352: Issue above order allocation: Supervisor or Owner may override with a reason; the Storekeeper is blocked.
- R2-363: Return of material never issued to that order is blocked for everyone.
- R2-369 / R2-370 / R2-371 / R2-373: Clock Out pre-fills with the shift end only when empty (still editable), plus a one-click "standard shift" button.
