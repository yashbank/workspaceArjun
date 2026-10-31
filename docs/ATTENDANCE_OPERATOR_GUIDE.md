# Attendance Operator & Super Attendance Operator guide

For whoever runs the gate — on the Android tablet mounted at the entrance, or on the web Kiosk
screen from a desktop/laptop. Both do the same job; the tablet also keeps working with no
internet.

## The two roles, in one line

- **Attendance Operator** — runs the gate: signs in, picks a shift, scans/types people in and
  out, approves straightforward leave requests.
- **Super Attendance Operator** — everything above, **plus** reviewing punches the system
  couldn't decide on its own (an unrecognised badge, a correction past the normal window) and
  reading attendance reports.

Neither role ever sees a wage figure, a salary, or payroll — that is Owner-only, on every screen,
everywhere, including this one.

## Starting a shift at the gate (Android tablet)

1. **Sign in** — type or scan your own badge code. Only an Attendance/Super Attendance Operator
   (or Admin/Owner) can sign in here; anyone else is refused with a clear message.
2. **Pick a shift** — you must choose the shift you're running before the tablet lets you punch
   anyone. (If the Owner hasn't set up any shifts yet, this step is skipped automatically rather
   than leaving you stuck — but ask the Owner to add shifts as soon as possible.)
3. You're ready. The status bar along the top shows the tablet's name, last-sync time, your
   shift, and the current time in the factory's own time zone — not the tablet's, so it's correct
   even if the tablet's own clock is wrong.

## Punching someone in or out

- **Show your badge** → point the badge's QR code at the camera. A **confirm card** pops up with
  the person's name and photo so you can check it's really them before confirming — reject it if
  the face doesn't match, no harm done.
- **Enter code manually** if the camera can't read a badge (torn, glare, etc.) — type the code,
  the same confirm card appears.
- The card defaults to whichever direction (in/out) makes sense for that person right now; tap
  **Change to IN/OUT** if it guessed wrong.
- A punch that's still sending shows a brief overlay; you can't double-tap it through by accident.

## No internet at the gate? Keep going.

The tablet queues punches locally and sends them the moment it has a connection again — nobody
needs to wait, and nothing is lost. If something needs a second look (a badge the tablet doesn't
recognise, or a punch that's been stuck retrying), it shows up on the tablet's own health screen:

- **View queue** — every punch, sent or still waiting, newest first.
- **Retry sync now** — force a sync attempt immediately.
- A punch that's failed repeatedly (10 attempts) is parked as **STUCK** with a **Retry** button
  next to it, rather than silently blocking everything behind it.

A **Super Attendance Operator** also sees the web **Queue** screen (`/mis/queue`) for anything
that needs an actual decision — an unrecognised badge, or a correction request past the normal
window — and decides it there.

## Handing the tablet to the next operator

Just sign the new operator in — there's no separate "handover" button to remember. The moment
the next operator's first punch goes through, the system records who had the gate before and who
has it now (visible to the Owner/Admin on the device's own card in Settings → Devices, as "Last
handover"). If you're stepping away and won't be punching anyone again this shift, use **End
shift / hand over** on the health screen so the tablet shows a clean "no operator" state until
the next person signs in.

## Leave requests

Open **Leave** (`/mis/attendance/leave`, or the Leave tab on your phone) to see pending requests.
Approve or reject each one — you can't decide your own leave request (someone else has to). An
approved multi-day request marks every working day in the range; whether that day is paid or
unpaid is an Owner-level setting (Settings → Leave pay), not something you choose here.

## What you'll never see, and why

Late minutes and OT minutes ARE shown on the attendance screen (they're computed automatically
from punches against the shift, not typed in), but wage amounts, salary, payslips and the bank
transfer file are Owner-only everywhere in this system — this isn't a bug if a screen looks like
it's missing a rupee figure you expected; it's deliberate.
