Subject: MIS Round 2 — Batches 2 and 3 deployed (releases 2026-10-19 and 2026-10-20)

Batches 2 and 3 of your Round 2 findings are both deployed. Fixed items are "Fixed - Ready to Retest".
Files to use
- docs/qa/MIS_V2_TESTER_GUIDE.md: section 14 (batch 2) and section 15 (batch 3,
  includes a 10-line UI smoke checklist).
- docs/qa/MIS_TESTER_TRACKER.xlsx: refreshed; each bug shows status and fix note.
- docs/qa/R2_DECISIONS.md: the intent behind each fix.
How to retest
1. Work through the rows in sections 14 and 15 with the stated role.
2. Record Result and notes in the Tests sheet.
3. Move a bug to Bug Resolved only if your retest passes; otherwise leave a
   Tester comment with what you saw (role, device, time).
4. Run the smoke checklist at the end of section 15 once.
5. Send back your copy of the workbook.
New in batch 3
- R2-102: Owner sets each leave type Paid/Unpaid in Settings > Leave pay.
- R2-46: approved COA/job-card versions are frozen; Admin/Owner use Update to latest.
- R2-82: item form fields are searchable dropdowns.
Known items, please do not fail these
- R2-68 / R2-78 / R2-105: camera scanning needs a real device (Chrome on Android).
  It cannot be tested on desktop or an emulator. Typed entry works everywhere.
- R2-28 is a blank row in the sheet (Deferred); delete it or fill it in.
If screens error or fields are missing, the database migrations may not be applied; tell us.
Thanks,
