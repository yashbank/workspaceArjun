# Access walkthrough — one script per role

_Written by Phase 14. For someone who is not a developer, on a phone (about 400px wide). Tick the box if what you
see matches the line; write what you saw if it does not. Screens to compare against are in
`Arjun/design/screens/` (R1 Owner, R2 Supervisor, R3 QC, R4 Admin, R5 Attendance Operator)._

**Before you start.** You need one test login per role (Owner, Admin, Supervisor, QC, Attendance Operator, Super
Attendance Operator, Store Manager). Each must be added by the Owner on `/mis/settings/users`. A Worker has no login —
skip that role. Use a phone or a browser window narrowed to phone width. Sign out fully between roles.

**How to read a line.**
- ☐ **SEE** — this must be on screen.
- ☐ **NOT SEE** — this must be absent. Absent means *not there at all*, not greyed out.
- ☐ **TYPE** — type this address after `/mis` and expect the page named. A refusal page ("not permitted") is the
  correct answer where it says REFUSED.
- **KNOWN BUG Fnn** — the system does the wrong thing today (see `qa/FINDINGS.md`). The box is written for the
  *correct* behaviour, so it should **fail** until the bug is fixed. A pass on a KNOWN BUG line means it was fixed —
  tell the developer so the matching automated case can be switched on.

The bottom bar is five tabs, in this order, for every role (MIS_UI_SPEC §4.5). Tap each one; it must open.

---

## 1. Owner

1. ☐ SEE bottom bar: **Home · Approvals · Orders · Reports · Settings**
2. ☐ SEE on Home: "Waiting on you" (approvals), Needs attention, Yesterday (three numbers), and a **wages card marked
   "visible to you only"**. This is the only screen with a money card.
3. ☐ Open **Settings**: SEE links to Wage types, AQL thresholds, Users and Gate tablets.
4. ☐ TYPE `/settings/wages` → the wage list opens with amounts.
5. ☐ TYPE `/settings/aql` → the four AQL thresholds open.
6. ☐ TYPE `/payroll` → payroll opens with pay figures.
7. ☐ Open **Reports** → a store value figure (₹) is shown.
8. ☐ Open **Users** → invite a new email; the seat counter ("used of max") goes up by one.

## 2. Admin

1. ☐ SEE bottom bar: **Home · Orders · Masters · People · Reports**
2. ☐ NOT SEE a wages card anywhere on Home. SEE shortcuts (New order · Issue job card · Masters), orders needing you,
   Attendance today, and a data-health card.
3. ☐ TYPE `/settings/wages` → REFUSED.
4. ☐ TYPE `/settings/aql` → REFUSED.
5. ☐ Open **People** → you see yourself and the people *below* you, **not the Owner and not another Admin**.
6. ☐ Open **Reports** → NOT SEE any ₹ figure (no "IN Value" column, no store value total).
7. ☐ TYPE `/payroll` → **KNOWN BUG F-01**: should be REFUSED; today it opens with pay figures.
8. ☐ Open **Settings → business rules** → **KNOWN BUG F-02**: NOT SEE any rule with "wage", "daily wage", "overtime
   multiplier" or "late penalty" in its name; today they can appear.
9. ☐ Open **People**, edit yourself, and look at the role picker → NOT SEE "Owner" in the list.
   **KNOWN BUG F-10**: the picker hides it, but the server does not refuse it.
10. ☐ Open a BOM → NOT SEE "₹ / unit" beside any material. (Hidden on screen today; **KNOWN BUG F-06**: the number is
    still sent to the phone — a developer must check this one.)

## 3. Supervisor

1. ☐ SEE bottom bar: **Home · Machines · Jobs · Crew · Me**
2. ☐ SEE on Home: a big **+ Record production** button first, machine counts (Free / Running / Down), phases waiting
   for your sign-off, and "My crew today".
3. ☐ NOT SEE a wages card, Approvals or Settings.
4. ☐ Open **Crew** → you see **only your own crew**. A worker who belongs to another supervisor is not listed.
5. ☐ Open **Machines** → you see **every machine in the plant** (the card says "All N visible"). Machines are not
   narrowed by crew.
6. ☐ TYPE `/settings` → REFUSED. TYPE `/settings/wages` → REFUSED. TYPE `/audit` → REFUSED.
7. ☐ TYPE `/payroll` → **KNOWN BUG F-01**: should be REFUSED; today it opens.
8. ☐ TYPE `/approvals` → **KNOWN BUG F-13**: the list should not show leave requests or purchase orders (you cannot
   read either elsewhere); today it can.

## 4. QC

1. ☐ SEE bottom bar: **Home · Checks · Defects · COA · Me**
2. ☐ SEE on Home: the next-check countdown, the hourly slot grid (a dashed slot means *never checked*), and any
   failure card.
3. ☐ NOT SEE a wages card, People, Attendance, Settings, Payroll.
4. ☐ TYPE `/payroll` → REFUSED. TYPE `/employees` → REFUSED. TYPE `/attendance` → REFUSED.
5. ☐ TYPE `/settings/aql` → REFUSED (only the Owner edits the thresholds).
6. ☐ Record an AQL sample → it accepts or rejects. **Ask Arjun** whether you should see the limit numbers on the
   result (open question, not a bug).
7. ☐ TYPE `/approvals` → **KNOWN BUG F-13**: NOT SEE leave requests or purchase orders.

## 5. Attendance Operator

1. ☐ SEE bottom bar: **Home · Register · Leave · Kiosk · Me**
2. ☐ SEE on Home: kiosk health card, "Clocked in today", "forgot to clock out", "late this morning".
3. ☐ NOT SEE orders, masters, reports, settings or a wages card.
4. ☐ Open **Kiosk** → the gate screen opens and accepts a scan.
5. ☐ TYPE `/orders` → REFUSED. TYPE `/settings` → REFUSED. TYPE `/reports` → REFUSED.
6. ☐ TYPE `/payroll` → **KNOWN BUG F-01**: should be REFUSED; today it opens with pay figures.
7. ☐ Open **People** (if reachable from Register) → you see only yourself, not the whole factory. (The gate kiosk
   itself still recognises *every* badge — that list is deliberately factory-wide.)

## 6. Super Attendance Operator

1. ☐ SEE the same bottom bar as an Attendance Operator: **Home · Register · Leave · Kiosk · Me**
2. ☐ SEE on Home, in addition: a dashed "Corrections open" card and a "Waive today's lateness" toggle.
3. ☐ Open **Reports** → attendance figures open; NOT SEE any ₹ figure.
4. ☐ TYPE `/payroll` → **KNOWN BUG F-01**: should be REFUSED; today it opens.
5. ☐ TYPE `/settings` → REFUSED.

## 7. Store Manager

1. ☐ SEE bottom bar: **Home · Stock · Receive · Issue · Me**
2. ☐ SEE on Home: stock health, today's IN / OUT counts, open GRNs, quick actions Receive · Issue · Count.
3. ☐ NOT SEE orders, attendance, people, reports, settings or a wages card.
4. ☐ TYPE `/orders` → REFUSED. TYPE `/attendance` → REFUSED. TYPE `/payroll` → REFUSED. TYPE `/employees` → REFUSED.
5. ☐ Receive a small GRN and issue some stock → each commits once, and the stock number changes by exactly that
   quantity.

## 8. A person with a login but no MIS role

1. ☐ Sign in as a workspace user who was never given an MIS role → SEE only **Home** and the "No MIS role" message.
   NOT SEE any other tab.
2. ☐ A **workspace** Owner/Admin who has no MIS role is *not* an MIS Owner: they must see the same thing.

## 9. Language toggle (all roles)

1. ☐ Tap **हिंदी** → the labels change immediately.
2. ☐ Sign out, sign in on another phone → still Hindi.
3. ☐ Tap **English** → back to English. There is no third language.

---

**Sign-off.** Tester ______________ Date ____________ Ticks ____ / ____ KNOWN BUG lines that passed ____
(each is a fix that landed — tell the developer).
