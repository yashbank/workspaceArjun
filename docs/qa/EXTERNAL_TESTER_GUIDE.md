# BPP MIS — External Tester Guide & Report

**What this is:** the script to follow to test the Bhaskar Paper Products MIS web platform and its
Android kiosk app before go-live. Follow it role by role. Fill in the report template at the
bottom as you go — don't wait until the end, you will forget details.

**What you're testing:**
1. The web platform — `https://workspace-arjun.vercel.app` (desktop browser AND a phone browser,
   both matter — see §0).
2. The Android kiosk app — installed on the gate tablet(s).

**Accounts:** ask the project owner for one login per role you're testing (`OWNER`, `ADMIN`,
`SUPERVISOR`, `QC`, `ATTENDANCE_OPERATOR`, `SUPER_ATTENDANCE_OPERATOR`, `STORE_GUY`). `WORKER`
has no portal login — workers only use the kiosk tablet.

| Role | Login email given to you | Tested? |
|---|---|---|
| OWNER | | ☐ |
| ADMIN | | ☐ |
| SUPERVISOR | | ☐ |
| QC | | ☐ |
| ATTENDANCE_OPERATOR | | ☐ |
| SUPER_ATTENDANCE_OPERATOR | | ☐ |
| STORE_GUY | | ☐ |

---

## §0. Before you start — the basics every screen must pass

For **every** screen you open, regardless of role:
- It loads without a "Something went wrong" error or a blank white page.
- No spinner that never finishes (wait at least 10 seconds).
- Numbers shown match reality you can check (e.g. a stock count matches what you expect).
- Try it on a **phone-width browser window** (or an actual phone) and on a **desktop-width
  window**. Below ~1024px wide it should switch to a single-column phone layout; above that, a
  sidebar + wider layout. Both must be usable — no cut-off buttons, no horizontal scrolling.
- If you can edit/save something, refresh the page afterward and confirm your change actually
  stuck (didn't just look saved).

If a screen fails any of the above, that's a bug — log it in the report template (§8).

---

## §1. OWNER

Log in as Owner. You should land on a home screen with, top to bottom: a row of pending approvals
you need to act on, a "needs attention" alerts section, yesterday's factory numbers (output,
wastage, machines run), and — only on this login, nobody else — a wages/money card.

Check:
- [ ] The wages/salary card appears here and **nowhere else** — log out, log in as any other role,
      confirm you cannot find wage figures anywhere on their screens either (this is a
      confidentiality rule, treat it as a serious bug if money leaks to another role).
- [ ] Approvals tab — approve and reject at least one pending item each; confirm the badge count
      on the tab drops accordingly.
- [ ] Orders tab — open an existing order, check its detail page loads fully (items, BOM, status).
- [ ] Reports tab — open each report available; confirm it's not an empty/placeholder page.
- [ ] Settings → Users — invite or view a user; confirm role assignment is visible and correct.
- [ ] Settings → Wages — **pay close attention here, this area is newly built and untested with
      real data.** Try viewing/editing a wage rule. Confirm a past, already-closed month's pay
      doesn't change when you edit a *current* wage rate (editing today's rate should never
      silently rewrite last month's numbers).
- [ ] Payroll screen + a payslip print-out — **this entire area has never been run with real
      data end to end.** Generate a payslip for one real employee and sanity-check every number
      on it (days present, OT, deductions, final pay) against what you'd expect from their actual
      attendance that period.

## §2. ADMIN

Home: 3 shortcut buttons (new order / issue job card / masters), orders needing action, today's
attendance count, and an amber "data health" card about incomplete master data.

- [ ] Create a new order end-to-end (pick a customer, add items, save). Confirm it appears in the
      Orders list immediately.
- [ ] Masters — open each sub-area (Items, Machines, Processes, Departments, Defect Types). **Defect
      Types has never been populated — check whether you can actually add one and whether it then
      shows up correctly wherever defects are recorded (QC role, §4).**
- [ ] People/Employees — open an employee's detail page, confirm their info is correct and editable.
- [ ] Fix the "data health" warning if one is shown (e.g. add the missing Hindi name) and confirm
      the amber card clears.
- [ ] Settings → Devices — this is where a new kiosk tablet gets paired (see §6, Android section).
      Confirm you can see a pending pairing request and approve it.

## §3. SUPERVISOR

Home: a big "Record production" button first, a line-clearance blocker if one exists, 3 machine
tiles (free/running/down), a sign-off queue, and today's crew count.

- [ ] Record a production entry against a real order. Confirm it shows up in that order's history.
- [ ] **Line-clearance card — this has never been triggered with real data, test it specifically:**
      try to start a new job/phase when a line-clearance would normally be required and confirm
      the app actually blocks or warns you, rather than silently letting it through.
- [ ] Machines tile — tap into a machine, confirm its status (free/running/down) is accurate and
      changing it reflects immediately on the home tile.
- [ ] **Sign-off queue — the core "BPR" flow, never run end-to-end on this build.** Walk a job
      through its full sequence of phases, signing off each one in order. Confirm:
      - You genuinely cannot sign off phase 2 before phase 1 is signed off (try it — it should be
        blocked with a clear message, not a raw database error).
      - Once all phases are signed off, the job/order status updates correctly.
- [ ] Crew tab — confirm today's crew list matches who's actually clocked in (cross-check against
      Attendance operator's screen, §5).

## §4. QC

Home: a countdown to the next hourly check, an 8-slot grid for the day's checks (pass/fail/not
yet/never-checked — each should look visually distinct), a failure alert card, and a to-do list.

- [ ] Start and complete a scheduled check from the countdown card.
- [ ] Tap through a few grid slots — confirm pass (green), fail (red), make-ready (grey) and
      never-checked (dashed outline) really do look different, not just same-colour variations.
- [ ] **Defects — never exercised with real data.** Log a defect against a real production batch;
      confirm it appears on both the QC screen and wherever defects are reported to Supervisor/Admin.
- [ ] COA (Certificate of Analysis) print — generate one for a real order, check every field is
      populated (not blank/placeholder) and the PDF/print view looks correct.
- [ ] Documents tab — upload a document, confirm it's retrievable afterward.

## §5. ATTENDANCE_OPERATOR / SUPER_ATTENDANCE_OPERATOR

This is the most heavily tested area already — treat this as confirmation, not first discovery.

- [ ] Kiosk screen shows live in/out counts; counts should update within a few seconds of someone
      punching on the Android tablet (§6) — **no manual refresh needed.**
- [ ] A night-shift worker who clocks in late evening and out past midnight shows up correctly on
      **one** day's attendance, not split across two days or missing entirely.
- [ ] Open an attendance row's "Punches" detail — confirm it shows which kiosk device AND which
      operator (if any) processed each punch.
- [ ] Mark an employee absent in bulk (select a few, "Mark Absent") — confirm it applies to all
      selected.
- [ ] Leave tab — submit and approve a leave request.
- [ ] **(SUPER only)** Corrections and "waive today's lateness" — test both; confirm a correction
      doesn't overwrite history (old + corrected punch should both still exist, check the punch
      detail slide-over).
- [ ] **Extra-pay day — brand new, never used.** Create one, assign it to a department or specific
      employees, confirm it reflects correctly wherever pay is calculated.

## §6. STORE_GUY + general store flows (any role with store access)

- [ ] Receive a delivery (GRN): search/scan an item, add it to the cart, confirm quantity,
      "Confirm receipt." Confirm stock count increases immediately after.
- [ ] Issue stock the same way; confirm stock count decreases immediately after.
- [ ] Physical count screen — do a count on a real item, confirm any variance is flagged.
- [ ] Low-stock alert — confirm an item below its threshold actually shows as low-stock.
- [ ] Purchase Orders — raise one of each kind: **"From BOM requirement"** and **"Buffer stock" (no
      BOM reference)**. Confirm both are clearly labeled as to WHY they exist wherever they appear
      (list, detail, printed PO, approval screen) — a buffer-stock PO should never look like
      something is "missing" a BOM link.
- [ ] Suppliers — open a supplier's detail page, confirm order/GRN history shows correctly.

## §7. Android Kiosk App (tablet at the gate)

Pair a NEW tablet from scratch if possible (don't just reuse an already-paired one):
- [ ] On first launch, the app shows a pairing code. An Admin approves it from the web portal's
      Settings → Devices screen. The tablet should pick up its credential automatically within a
      few seconds of approval, with no manual step on the tablet.
- [ ] Operator sign-in: before punching anyone, sign in as yourself (the operator) once.
- [ ] Punch a real employee in by badge scan. Confirm: (a) it's fast — no multi-second hang, (b) it
      shows on the web Kiosk screen within a few seconds, (c) the attendance record's "Punches"
      detail (§5) correctly shows you as the operator.
- [ ] Punch the same employee out. Confirm no duplicate "in" record is created if you accidentally
      tap twice quickly.
- [ ] Turn on airplane mode, punch 2–3 people, turn airplane mode back off. Confirm the queued
      punches send automatically and all land correctly with no duplicates.
- [ ] End-of-shift handover: use the device-health screen's "clear operator" action; confirm the
      NEXT operator is forced to sign in again before punching anyone.
- [ ] Ask an Admin to revoke this tablet from the web portal. Confirm the tablet wipes its
      credential and returns to the pairing screen — it must not be able to punch anyone after
      revocation.

---

## §8. Bug report template — copy this block for every issue found

```
### Bug #<n>
Role/screen:
What you did (steps):
What you expected:
What actually happened:
Severity: [ Blocker — breaks core work | Major — wrong data/behavior | Minor — cosmetic ]
Screenshot/video attached: Y/N
Can you reproduce it again?: Y/N
```

---

## §9. Final summary — fill in once all sections above are done

```
Tester name:
Date(s) tested:
Roles tested (check table at top):
Total bugs found:  Blocker ___  Major ___  Minor ___
Areas NOT tested (if any) and why:
Overall verdict: [ Ready for go-live | Ready with known minor issues | Not ready — blockers listed above ]
```

Send the completed file (with both templates filled in) back to the project owner when done.
