# Owner onboarding — Bhaskar Paper Products MIS

A practical first-week guide for the Owner account. Everything below is something you do from
a browser at the portal URL, signed in as Owner — the one role that sees every screen and every
rupee figure in the system.

## 1. Add your people

**Employees** (sidebar → Employees, or `/mis/employees`)

- **+ Add Employee** for one person at a time: code, name, phone, role, department, wage type.
- **Import CSV** for a whole roster at once. Use **↓ CSV** first on an empty or existing list to
  get the exact column headers, fill in one row per employee, then **Import CSV**. Rows with a
  problem (bad role, duplicate code, missing name) are skipped and listed by row number — the
  good rows still import, so you don't need a perfectly clean file to get most of the way there.
- Each employee's row has a **Badge** link — a printable QR badge (credit-card size) they scan at
  the gate kiosk. To print every active employee's badge at once for a new batch of ID cards, use
  **Print all badges** instead of opening each one individually.
- Bank details (account number, IFSC) are optional but needed before you can download a month's
  bank transfer file — add them from an employee's profile (Edit Employee).
- Roles that matter day-to-day: **Attendance Operator** / **Super Attendance Operator** run the
  gate and approve leave; **Admin** manages masters/orders/production but never sees wages; only
  **Owner** sees wages, salaries and the payroll bank-transfer file.

## 2. Set up shifts and the gate tablet

- **Shifts** — set up each working shift (start/end time) before pairing any tablet; the kiosk
  app won't let an operator sign in without at least one active shift to choose (unless none
  exist yet at all, in which case it skips the choice rather than getting stuck).
- **Devices** (`/mis/settings/devices`) — pairing a new gate tablet: open the kiosk app on the
  tablet, it shows a short pairing code, you type that code in here to approve it. Once paired,
  the tablet needs no further login — it works offline and syncs automatically.
- Each device's card here shows its last sync time, queued (unsent) punches, battery, and its
  **last handover** — which operator signed off and who took over, so you always know who was
  running the gate at any point.
- If a tablet is lost or replaced, **Retire** it from this screen; punches it already sent stay
  on record, flagged as coming from a retired device, nothing is lost.

## 3. Leave types and what gets paid

**Settings → Leave pay** (`/mis/settings/leave-pay`, Owner only)

- Every leave type (CL, SL, EL, LWP, Other) starts **Unpaid** — turning one on deploys with zero
  payroll impact until you decide otherwise.
- Toggle a type to **Paid** and an approved leave day of that type is paid like a present day from
  that point on. The change prices the month it lands in; a month you've already closed never
  moves, however you toggle things afterwards.
- Every toggle is audited (who, when, what changed) and kept as history — nothing is silently
  overwritten.
- Admin can see this screen but cannot change it (refused with a clear "Owner only" message).

## 4. Wages and payroll, month by month

**Settings → Wages** (`/mis/settings/wages`) — edit a wage type's name/details and see its rate
history (every past rate change, with the date it took effect). **Payroll** (`/mis/payroll`):

1. Review the month's attendance (late minutes, OT minutes and basic wage are all computed from
   actual punches, not typed in by hand — see `docs/qa/attendance-walkthrough.md` if you ever
   want to hand-check a figure against the app's own number).
2. Close the month once you're satisfied. A closed month's figures are frozen — later leave-pay
   or wage-rate changes never move them.
3. **Send payslips** — employees only ever see a payslip you've explicitly sent, and only for a
   past (closed) month, never the current one.
4. **Print all payslips** gives you every slip in one scrollable, printable page instead of
   opening each person's one at a time.
5. **Download bank transfer file** (Owner only) — a CSV ready for your bank's bulk-transfer
   upload; employees missing bank details are listed separately so nothing silently fails.

## 5. Keeping the data clean before go-live

If testers or trainees have been punching in/out and applying test leave while you were setting
things up, clear that out before the real roster starts using the system:

```
CONFIRM_RESET_MIS_ATTENDANCE=true pnpm mis:reset-attendance
```

This wipes attendance punches, leave requests, extra-pay days, payroll runs/snapshots, released
payslips, shift-handover records and the kiosk's offline queue — **it never touches** your
employees, shifts, wage types, leave-pay settings, or paired devices. Read the comment at the top
of `prisma/reset-mis-attendance-data.ts` before running it; it lists exactly what it deletes.

(There is a separate `pnpm workspace:reset` — that one is for the Files/Documents workspace, not
attendance. Don't confuse the two.)

## 6. Day-to-day places you'll come back to

| What | Where |
|---|---|
| Who's in today, late/OT figures | `/mis/attendance` |
| Approve/reject leave your operators haven't already decided | `/mis/attendance/leave` |
| Who can log in and as what role | `/mis/settings/users` |
| Every change anyone made, with before/after | `/mis/audit` |
| Punches waiting for a decision (unrecognised badge, etc.) | `/mis/queue` |

For what each Attendance Operator and Super Attendance Operator sees and does day to day, give
them `docs/ATTENDANCE_OPERATOR_GUIDE.md`.
