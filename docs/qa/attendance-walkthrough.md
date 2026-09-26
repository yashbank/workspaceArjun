# Attendance & payroll reconciliation walkthrough (MIS-259)

_Phase 19. A method plus one worked example — not a real month's numbers, because no real
factory data was available in this session. Run the method below against a real closed month
with Arjun present to get the actual reconciliation this ticket asks for._

## The method

1. Pick a month that is fully attended (no gaps) and NOT yet closed (`getPayrollPeriod` reports
   `OPEN`), so `calculateMonthlyPayroll` computes it live from `MisAttendance`.
2. Export the month's attendance from `/mis/attendance?view=monthly` (or query
   `MisAttendance` directly for that date range) — this is the source of truth the code sums.
3. For each employee, independently — on paper or a spreadsheet, not from the app — compute:
   - **Basic wage** = Σ over days (day fraction × the wage rate in force ON that day). Day
     fraction: PRESENT = 1, HALF_DAY = 0.5, ABSENT/LEAVE = 0 (DAILY employees). A MONTHLY
     employee's Sunday is always fraction 1, whatever its own status or absence of a row (D28).
   - **OT pay** = OT minutes ÷ 60 × the employee's OT rate (their wage code's `otRatePerHour` if
     set, D26; otherwise the day rate ÷ 8 × the `OT_MULTIPLIER` rule in force that day).
   - **Late penalty** = late minutes × the `LATE_PENALTY_PER_MIN` rule in force that day.
   - **HRA / Allowance / Bonus** = the wage code's own amount, only if that component is not
     toggled off for the employee (25.1), resolved as of the month's last day.
   - **Extra pay** = Σ over any APPROVED extra-pay day that includes the employee: a flat amount
     added directly, or a multiplier × the day rate (or the hour rate, if the code's
     `multiplierBasis` is `PER_HOUR` — D28/25.5).
   - **Gross** = basic + OT + HRA + allowance + bonus + extra pay − late penalty.
4. Open `/mis/payroll` for the same month as the Owner, and read the SAME employee's payslip
   (`/mis/print/payslip/[id]`) for the actual breakdown the app computed.
5. Put both sets of numbers side by side with a **difference column**. Any non-zero difference
   is a bug, not a rounding note — `calculateMonthlyPayroll` rounds each figure once, at the end
   (see `payroll-figures.test.ts`'s own comment), so a hand calculation that also rounds once
   should match to the rupee.

## Worked example (synthetic — the fixture `payroll-figures.test.ts` and `rule-history.test.ts`
already pin, used here to demonstrate the METHOD, not a real reconciliation)

One employee, January (fixture rates: daily wage ₹731.19, OT multiplier ×2.375, late penalty
₹0.83/min), five recorded days:

| Date | Status | Late (min) | OT (min) |
|---|---|---|---|
| 5 Jan | PRESENT | 0 | 0 |
| 6 Jan | HALF_DAY | 60 | 30 |
| 7 Jan | ABSENT | 0 | 60 |
| 8 Jan | LEAVE | 0 | 0 |
| 9 Jan | PRESENT | 0 | 0 |

**By hand:**
- Basic = 731.19 (5th) + 0.5×731.19 (6th, half day) + 0 (7th, absent) + 0 (8th, leave) + 731.19
  (9th) = 731.19 + 365.595 + 0 + 0 + 731.19 = **1827.975 → ₹1828**
- OT = 1.5 h (90 min: 30 on the 6th + 60 on the 7th — OT is independent of the day's own pay
  status, the 7th earns OT despite earning no basic pay) × (731.19 ÷ 8) × 2.375 = 1.5 × 91.399 ×
  2.375 = **325.61 → ₹326**
- Late penalty = 60 × 0.83 = **49.8 → ₹50**
- Gross = 1828 + 326 − 50 = **₹2104**

**From the app** (same fixture, `payroll-figures.test.ts`'s own pinned assertion):
`basicWage: 1828, otPay: 326, latePenalty: 50, grossPay: 2104`.

| Figure | By hand | App | Difference |
|---|---|---|---|
| Basic wage | 1828 | 1828 | 0 |
| OT pay | 326 | 326 | 0 |
| Late penalty | 50 | 50 | 0 |
| Gross | 2104 | 2104 | 0 |

## What this does NOT cover yet

- A real month's worth of real employees, real wage codes and real extra-pay days — needs a
  live database and Arjun present to confirm the "by hand" column against what he actually
  expects (this is the point of MIS-259; a synthetic fixture cannot substitute for it).
- Reconciling a CLOSED month against its own snapshot (`MisPayrollSnapshotLine`) — mechanically
  the same method, reading the frozen row instead of a live computation; worth doing once a real
  month has actually been closed.
