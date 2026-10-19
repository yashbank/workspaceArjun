Subject: MIS Round 2 — Batch 2 deployed (release 2026-10-19)

Hi,

Batch 2 of your Round 2 findings is deployed. 37 items are now "Fixed - Ready to Retest"
in the tracker sheet (R2-02, 10, 17, 25, 34, 37, 38, 40, 41, 45-48, 64, 66-68, 74, 77-85,
88, 89, 101, 102, 105, 109-111, 114, 116).

Before you start
- The owner must apply the new database migrations first. If screens error out or
  new fields are missing, the migrations have not been applied yet; tell us.

How to retest
- Use the new section "§14. Round 2 — Batch 2 (release 2026-10-19)" in the V2 Tester Guide.
  There is one row per fixed ID, with the role, what to do and the expected result.
- Open the refreshed tracker workbook; each fixed bug shows its status and fix note.
- Record Result/notes in the Tests sheet. Move a bug to Bug Resolved only if your retest passes;
  otherwise leave a Tester comment with what you saw.
- Intent for each fix is in docs/qa/R2_DECISIONS.md.

Still open / deferred (please do not fail these)
- R2-102: leave types (CL/SL/EL/LWP/Other) are recorded and shown, but payroll does not
  yet treat paid and unpaid leave differently. Planned for a later batch.
- R2-68 / R2-78 / R2-105: camera scanning is built but needs a real device
  (Chrome on Android). Typed entry works everywhere. Please test on a phone.
- Approved document versions (COA, job card) do not freeze content: a later reprint
  can show changed data under the same approved version. Known gap.

Thanks,
