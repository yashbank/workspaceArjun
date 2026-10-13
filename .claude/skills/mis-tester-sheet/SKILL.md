---
name: mis-tester-sheet
description: Maintain the tester workbook docs/qa/MIS_TESTER_TRACKER.xlsx (test script + bug/enhancement tracker) with scripts/tester_sheet.py instead of reading or hand-editing the spreadsheet. Use when the tester sends a returned workbook or new bug report, when bugs are fixed/deferred, when a new release adds tester-guide rows, or when asked for bug status counts.
---

# mis-tester-sheet

Never open the .xlsx in context. Use `python3 scripts/tester_sheet.py <cmd>` (needs openpyxl).

| Need | Command |
|---|---|
| New release rows added to `docs/qa/MIS_V2_TESTER_GUIDE.md` | `build` (keeps tester Result/Notes/Bug ID by test ID, keeps all bugs) |
| Import a tester report (md with "Bug #N" blocks) | `seed-bugs "<report.md>"` (adds only unseen IDs, R2-NN) |
| Tester sent back their copy | `merge <their.xlsx>` (takes tester columns: Result, Tester notes, Bug ID, Retest by tester, Tester comment, new rows, Status changes) |
| We fixed / deferred bugs | `set R2-04 R2-09 status="Fixed - Ready to Retest" fix="PR #81" release=2026-10-13` |
| Status counts and open items | `summary` |

Statuses: New Bug, Bug Reproduced, Not Reproducible, Fixed - Ready to Retest, Bug Resolved,
Enhancement Requested, Enhancement Still Required, Enhancement Done, Deferred. Add one by editing
STATUSES in the script (and the Lists sheet regenerates on next write).

Rules: tester owns Result/Tester notes/Bug ID/Retest/Tester comment; we own Status/Fix notes/Release.
Only the tester (or a passing retest) moves a bug to "Bug Resolved". Next round: new tester report ->
`seed-bugs`, fix, `set ... status="Fixed - Ready to Retest"`, add guide rows, `build`, send the xlsx.
Bug IDs use a round prefix (R2-NN); for round 3 change the prefix in `cmd_seed`.
