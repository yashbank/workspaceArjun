# R2 round 6B — product decisions (owner-approved, 2026-10-31)

Resolves every UNCLEAR row in `R2_ROUND6B_PLAN.md`. The builder implements these as written; if a decision looks wrong
in the code, stop and ask rather than change it. Each decision is also written in the tester sheet (Fix notes) and in the
tester message, so the tester knows what "correct" now means.

| Row(s) | Decision |
|---|---|
| R2-240, R2-261 | Worker or Admin may cancel an approved leave while its start date is still in the future. |
| R2-250 | Admin cannot choose pay type or wage code when onboarding an employee. Owner only; Admin sees a friendly message. |
| R2-256 | Closed payroll month: Owner may edit attendance with a reason; the payroll screen shows the drift banner. Non-Owner edits stay refused. |
| R2-263 | Supervisors get shift-roster permission this round. |
| R2-264 | Order quantity is mandatory. Units: pieces, kg, reams. Production completes only when produced >= ordered. |
| R2-265 | Customer PO number is optional, and prints on order documents when present. |
| R2-266 | Reopening an order only warns that reservations and machine bookings were cleared. No automatic re-reserve. |
| R2-267 | Start Production is blocked without an approved BOM. The Owner may override with a reason (audited). |
| R2-268 | BOM quantities are per finished unit. Existing BOMs are read as per-unit as stored. |
| R2-269 | BOM submit is blocked while any material has no catalogue item. No auto-create. |
| R2-270 | A BOM stage is complete when it has at least one material. |
| R2-272 | Payment terms come from a fixed list. Delivery date is mandatory. |
| R2-273 | Admin may NOT enter PO purchase rates (Owner-only rate rule D5/D24 stays). |
| R2-274 | Duplicate PO for the same BOM material: warn, do not block. |
| R2-275 | Cancelling a PO auto-discards its draft GRNs. |
| R2-276 | PO line unit differing from the item unit is rejected, not converted. |
| R2-277 | Only the Owner may reverse a confirmed GRN; reversing also reopens the PO. |
| R2-278 | Damaged GRN stock goes to a Quarantine location; the Owner returns it to the supplier. |
| R2-279, R2-280 | Over-receipt ceiling is 5%. Above it, and for a discrepancy invoice, the Owner signs off. No debit note this round. |
| R2-282 | The Storekeeper may see BOM materials and quantities (never prices). |
| R2-283 | If stock moved during a count, the reconcile recomputes against the live balance. |

Rows 235, 241, 252, 253, 256 and 259: `AGENT_GOTCHAS.md` says they are done but the code at HEAD does not show it. Verify
each in code first, implement if missing, and correct the gotchas line if it was wrong.
