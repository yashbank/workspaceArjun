# R2 round 6C: product decisions (owner to fill)

Resolves every UNCLEAR row in `R2_ROUND6C_PLAN.md` section 3. The builder implements these as written; if a decision looks wrong in the code, stop and ask rather than change it. Each decision is also written in the tester sheet (Fix notes) and in the tester message. Rows with no decision stay `BLOCKED_DECISION` and are skipped until filled.

| Row(s) | Question | Decision |
|---|---|---|
| R2-286 | Partly issued Material Request: keep balance open or close with a note? | |
| R2-287, R2-365 | Does staging a pick list hold the stock until handover or cancel? | |
| R2-288 | Supplier invoice states, who sets them, payment details recorded? | |
| R2-308 | SHIFT line clearance made outside a shift: how long does it last? | |
| R2-309 | JOB line clearance with no order booked: refuse, or apply to the next order? | |
| R2-311 | May the QC role acknowledge QC failures and waivers? | |
| R2-314 | Separate Major and Minor AQL limits in Settings, with what starting values? | |
| R2-315 | CoA summary: unresolved failures only, or all earlier failures too? | |
| R2-316 | Source of CoA Batch/Lot number and Manufacturing Date? | |
| R2-324 | Does the factory deduct PF, ESIC, PT, advances; bank file shows net pay? | |
| R2-325 | GST in invoice matching: ex-GST compare, or enter GST % and compare with tax? | |
| R2-330 | May Admin/Owner sign off a phase without being in-charge? | |
| R2-331 | May Admin reopen a signed phase (with reason)? | |
| R2-332 | May Supervisors be booked as machine crew? | |
| R2-333 | Crew booking for past shifts: how far back, which roles? | |
| R2-334 | Lot tracking scope this round? | |
| R2-336 | Item delete guards (stock, active BOM) and re-using a deleted code? | |
| R2-337 | Roster overlap: auto-cut the old entry? | |
| R2-338 | From which order status may a CoA be approved? | |
| R2-342 | Which role resolves parked offline-queue entries? | |
| R2-345 | Dispatch scope this round? | |
| R2-352 | Issue above order allocation: override by whom, or block? | |
| R2-363 | Return of material never issued to that order: block or allow with reason? | |
| R2-369, R2-370, R2-371, R2-373 | Pre-fill Clock Out with shift end; "standard shift" one-click? | |
