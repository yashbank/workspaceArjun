# Phase 19 · QA · attendance, kiosk and payroll

**Date:** 2026-09-26   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-234, MIS-239, MIS-242, MIS-247, MIS-254, MIS-259 (Epic E3)

## First task
Read §1A, the `PHASE_LOG.md` tail, and the previous report. **`phase-reports/phase-18.md` does
not exist** — Session B's own track (15–18, 22) has not reported through this branch yet. Noted,
not blocking (§1A: "a missing report is a fact worth recording, not a reason to stop").

## What was found already done — a QA phase reads before it writes
Most of this ticket set's testable surface was already built, mostly by Phase 25 (this same
session, days earlier) and Phase 13/14F before it:
- **MIS-234** (a full night shift end to end): `attendance-punch.test.ts` already proves a night
  shift (22:05→06:20) files as ONE row under the evening it started, both directions, the orphan
  case, and the shift-hint disambiguation (D22). The missing half — that a night-shift's own
  date-filing quirk cannot confuse PAYROLL's day-bucketing — is new, below.
- **MIS-247** (one named test per rule): daily wage rate, OT multiplier, late-penalty rate, and
  every kind of rate CHANGE (today/mid-month/back-dated/before-any-rule) are already one named
  `it()` each in `rule-history.test.ts`. D26 (OT-per-hour) and D28 (Sunday pay both pay types,
  extra-pay/OT overlap) are already one named test each in `payroll-25.test.ts`. **D20: a lateness
  THRESHOLD / grace period does not exist in code** (only `OT_MULTIPLIER`, a rate, exists) — already
  logged by Phase 13's stamp on this phase's own guide section; not re-invented here.
- **MIS-254** (correction windows): `attendance-punch.test.ts` already covers the window boundary,
  a parked late correction, and a correction landing at the original scan time. "Night-shift
  register" is the existing D8 month view (`attendance-month.test.ts` /
  `attendance-month-desktop.test.tsx`) — no separate feature exists to test.
- **MIS-239 / MIS-242** (kiosk on a real device, break sync at every point): **cannot run** — no
  physical tablet or the Expo app in this environment, exactly as Phase 12/13 already noted for
  themselves. Still open, unchanged.

## What was built
- `src/server/mis/attendance-payroll-rules.test.ts` (new, 4 tests): ABSENT and HALF_DAY as their
  own named tests (MIS-247's literal ask — they were previously proven only inside one combined
  "a mix of every status" test), an OT-recorded-on-an-absent-day case, and MIS-234's missing half —
  an attendance row filed under a night shift prices IDENTICALLY to the same row filed under a day
  shift (payroll never reads which shift a row belongs to).
- `docs/qa/attendance-walkthrough.md` (new, MIS-259) — the reconciliation METHOD (by-hand formula
  for every figure a payslip can carry, including 25.1–25.5's new components) plus one worked
  example using the already-hand-verified fixture from `payroll-figures.test.ts`. **Not a real
  reconciliation** — no real factory month or "Arjun's own numbers" were available in this
  session; the doc says so and gives the exact steps to run it against one.
- `docs/qa/FINDINGS.md` — F-08's second half ("a computed period is immutable once closed") is
  now marked done, citing Phase 25's `closePayrollPeriod`/snapshot work.

## Decisions cited
D20 (no lateness-threshold rule exists — nothing to test), D22 (a night shift files under the
evening it started), D26/D27/D28 (already-tested rate/period rules this phase names rather than
re-proves).

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: **188 files, 4153 passed + 9
expected-fail** (was 187/4149 — exactly the 4 new tests). No `pnpm build` — this phase's own
Verify block is tests/lint only, and no application code was touched (a QA phase never fixes
code, §6). Salary figures were checked before writing: the walkthrough's worked numbers are the
long-published fixture rates (₹731.19/day etc.), already public in the test file — no real wage
was written into any committed output.

## What changed for later phases
None.

## Pending
Real device testing for MIS-239/MIS-242 (a person with an Expo-capable tablet); a REAL
reconciliation walkthrough with Arjun once a month is ready to close (MIS-259's actual ask).
Neither blocks Phase 20.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-19.md
- Arjun/app/docs/qa/FINDINGS.md
