# Print comparison (MIS-131)

_Phase 16. A template for the manual check — printing the order/BOM/job-card documents beside
the client's own Excel-based equivalent — not run this session (no printer, no real client
workbook available). D3 applies: "PO" below means Customer PO, never the supplier PO._

Fill in one row per document, once a printer and the client's real Excel files are available:

| Document | Printed from | Client's Excel equivalent | Fields present in both | Fields only in the printout | Fields only in Excel | Notes |
|---|---|---|---|---|---|---|
| Job card | `/mis/print/job-card/[id]` | — | | | | |
| BOM | (no dedicated print route found — confirm before running) | — | | | | |
| Customer Order | (no dedicated print route found — confirm before running) | — | | | | |

## What to check for each
- Every column the client's sheet has, the printout either has or intentionally omits (note
  which, and why).
- Units match exactly (KG vs kg vs Kg is a real mismatch on paper).
- The customer's own PO reference appears wherever the client expects to see it — see
  `orders-walkthrough.md`'s MIS-134 note: this field does not exist in the app yet, so it will be
  absent from every printout until it is built.
- Money only appears on documents an Owner would hand to someone who should see it (D24) — note
  any rate/amount visible on a printout meant for a non-Owner audience.
