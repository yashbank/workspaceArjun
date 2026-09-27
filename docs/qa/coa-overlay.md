# COA overlay (MIS-204)

_Phase 18. A template for the manual check — overlaying the generated Certificate of Analysis
on the client's original — not run this session (no printer/light-table, no original COA on
file to overlay against)._

| Field on the original COA | Present on `/mis/print/coa/[id]`? | Value matches? | Notes |
|---|---|---|---|
| Order / batch reference | | | |
| Customer name | | | |
| Material specification (GSM, size, substrate, coating) | | | |
| QC parameters tested | | | |
| Pass/fail per parameter | | | |
| Defect counts (if any) | | | |
| Signed off by / date | | | |

## What to check
- Every field the client's original COA has, the generated one either has or intentionally
  omits (note which, and why).
- Units and number formats match (not just the numbers).
- Nothing on the generated COA claims a QC decision it does not have evidence for — cross-check
  against the stored `MisQcCheck` rows for that order, not against what "should" be true.
