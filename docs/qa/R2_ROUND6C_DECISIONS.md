# R2 round 6C: product decisions (owner-approved, 2026-11-01)

Resolves every UNCLEAR row in `R2_ROUND6C_PLAN.md` section 3. The builder implements these as written; if a decision looks wrong in the code, stop and ask rather than change it. Each decision is also written in the tester sheet (Fix notes) and in the tester message. Rows with no decision stay `BLOCKED_DECISION` and are skipped until filled.

| Row(s) | Question | Decision |
|---|---|---|
| R2-286 | Partly issued Material Request: keep balance open or close with a note? | Add a "Partially issued" status; the unfulfilled balance stays open. |
| R2-287, R2-365 | Does staging a pick list hold the stock until handover or cancel? | Staging a pick list holds the stock until handover; it is released on cancel. |
| R2-288 | Supplier invoice states, who sets them, payment details recorded? | Supplier invoice states: Approved for payment (Owner sets it), Paid with date and UTR (Accounts or Owner), Rejected. |
| R2-308 | SHIFT line clearance made outside a shift: how long does it last? | A SHIFT clearance made outside a shift lasts 8 hours. |
| R2-309 | JOB line clearance with no order booked: refuse, or apply to the next order? | A JOB clearance with no order booked is refused; the user is asked to use SHIFT mode. |
| R2-311 | May the QC role acknowledge QC failures and waivers? | The QC role may acknowledge QC failures and waivers, and only that action. |
| R2-314 | Separate Major and Minor AQL limits in Settings, with what starting values? | Separate Major (1.5) and Minor (4.0) AQL limits in Settings. |
| R2-315 | CoA summary: unresolved failures only, or all earlier failures too? | The CoA summary shows unresolved failures only. |
| R2-316 | Source of CoA Batch/Lot number and Manufacturing Date? | CoA lot number is the order number; manufacturing date is the production completion date. |
| R2-324 | Does the factory deduct PF, ESIC, PT, advances; bank file shows net pay? | The factory deducts PF, ESIC, PT and advances; the bank file shows net pay. |
| R2-325 | GST in invoice matching: ex-GST compare, or enter GST % and compare with tax? | The invoice has an optional GST %; matching compares the amount excluding GST. |
| R2-330 | May Admin/Owner sign off a phase without being in-charge? | Admin or Owner may sign off a phase without being in-charge, with a reason, audited. |
| R2-331 | May Admin reopen a signed phase (with reason)? | Admin may reopen a signed phase, with a reason. |
| R2-332 | May Supervisors be booked as machine crew? | Supervisors may be booked as machine crew. |
| R2-333 | Crew booking for past shifts: how far back, which roles? | Crew booking for past shifts: Admin or Owner only, up to 3 days back, with a reason. |
| R2-334 | Lot tracking scope this round? | Lot tracking this round: a lot number on goods receipt, shown in traceability only. |
| R2-336 | Item delete guards (stock, active BOM) and re-using a deleted code? | Item delete is blocked when stock is above zero or the item is in an approved BOM; re-using the code restores the old item. |
| R2-337 | Roster overlap: auto-cut the old entry? | A roster overlap auto-cuts the old entry after confirmation; history is kept. |
| R2-338 | From which order status may a CoA be approved? | A CoA may be approved from IN_PRODUCTION status onwards. |
| R2-342 | Which role resolves parked offline-queue entries? | Supervisor gets queue.review to resolve parked offline-queue entries. |
| R2-345 | Dispatch scope this round? | DEFERRED by owner: dispatch is out of scope this round. Log DEFERRED_BY_OWNER, do not build. |
| R2-352 | Issue above order allocation: override by whom, or block? | Issue above order allocation: Supervisor or Owner may override with a reason; the Storekeeper is blocked. |
| R2-363 | Return of material never issued to that order: block or allow with reason? | Return of material never issued to that order is blocked for everyone. |
| R2-369, R2-370, R2-371, R2-373 | Pre-fill Clock Out with shift end; "standard shift" one-click? | Clock Out pre-fills with the shift end only when empty (still editable), plus a one-click "standard shift" button. |

R2-345 is deferred by the owner: mark it DEFERRED_BY_OWNER in the plan checklist and leave it out of the build. Every other decision above is final; do not re-ask.
