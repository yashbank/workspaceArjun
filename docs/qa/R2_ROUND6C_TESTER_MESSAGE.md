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
