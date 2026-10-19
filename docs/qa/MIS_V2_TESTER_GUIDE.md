# BPP MIS — V2 Tester Guide (October 2026 release)

**What this is:** the script for testing the seven V2 features added on top of the platform you
already tested. Follow it role by role and log every issue with the bug template at the end
(same template as the main guide, `EXTERNAL_TESTER_GUIDE.md`).

**Where:** `https://workspace-arjun.vercel.app` — test on a desktop-width window AND a
phone-width window. Android kiosk: a rebuilt APK is needed for §7 (ask the project owner).

**Roles that changed:** OWNER, ADMIN, STORE_GUY, SUPERVISOR, QC. ATTENDANCE roles are unchanged
except that an employee may now have a photo.

---

## §0. Nothing old should have broken
Re-run your usual quick pass for every role: home loads, menu is the same, receive / issue /
GRN confirm / QC check / kiosk punch / payroll all still work exactly as before.
Any difference you did not expect is a bug.

---

## §1. Material requests (SUPERVISOR asks, STORE_GUY decides)
| # | Role | Steps | Expected |
|---|---|---|---|
| 1.1 | SUPERVISOR | Home → **Request material from the store** → add 2 items → choose a department → **Send request** | Green card "MRN-… is waiting for the Store"; link opens the request |
| 1.2 | SUPERVISOR | New request → pick an **order** → add an item of category EQUIPMENT or OTHER | Refused with a message naming the item (equipment is overhead, never booked to an order) |
| 1.3 | SUPERVISOR | New request → add an item whose stock is 0 | Allowed (a request is an ask, not an issue) |
| 1.4 | STORE_GUY | Home → **Requests (n)** tile → open the request | Lines show requested qty; input "Issue qty (max N)" |
| 1.5 | STORE_GUY | Type a qty above the requested | Field shows an error, **Approve & issue** is disabled |
| 1.6 | STORE_GUY | Lower one line, set another to 0 → Approve & issue | Status APPROVED; Store → Transactions shows the OUT lines; stock balance dropped by the issued qty only |
| 1.7 | STORE_GUY | Open an APPROVED request | No approve/reject buttons (cannot approve twice) |
| 1.8 | STORE_GUY | Reject a request without a note | "Give a reason to reject"; with a note → REJECTED |
| 1.9 | QC / ATTENDANCE | Go to `/mis/store/requests` by URL | "You do not have access" |

## §2. Order-wise allocation and capped issue (STORE_GUY, ADMIN)
| # | Role | Steps | Expected |
|---|---|---|---|
| 2.1 | ADMIN | Create a PO with purpose **From BOM** and BOM ref = an order number (e.g. `ORD-202610-00012`); approve it | — |
| 2.2 | STORE_GUY | Store → Receive → that PO → receive 100 of an item | GRN confirmed; Order → BOM tab shows "Stock allocated to this order: 100 left" (desktop shows a card under the bill of materials) |
| 2.3 | STORE_GUY | Store → Issue → choose that order | A blue box lists the allocated items and what is left |
| 2.4 | STORE_GUY | Issue 60, then try 41 | 60 goes through; 41 is refused: "only 40 of the 100 allocated…"; nothing is written |
| 2.5 | STORE_GUY | Issue 40 | Goes through; order page shows 0 left (red) |
| 2.6 | STORE_GUY | Issue a different item (never allocated) against the same order | Allowed from general stock (no lock-out) |
| 2.7 | STORE_GUY | Issue with **General issue** (no order) | Never capped |

## §3. GRN paperwork and 3-way match (STORE_GUY, OWNER, ADMIN)
| # | Role | Steps | Expected |
|---|---|---|---|
| 3.1 | STORE_GUY | GRN → New GRN → open it (DRAFT) | "Delivery paperwork" form: Supplier Invoice No, Invoice Date, DC No, LR No, Vehicle, Transporter. **No amount field** |
| 3.2 | OWNER | Same draft GRN | Form also has **Supplier Invoice Amount (₹)** |
| 3.3 | STORE_GUY | Add item: DC qty 100, Received 90, Damaged 4 | Line shows DC 100 · Damaged 4 · Short 6 |
| 3.4 | STORE_GUY | Add item: DC qty 100, Received 98, Damaged 3 | Refused: "more than the 100 on the delivery challan" |
| 3.5 | STORE_GUY | Enter invoice no, confirm the GRN | Confirmed; stock rose by 90 (good qty only) |
| 3.6 | OWNER | Open the PO | "3-way match" table: ordered / received / damaged / short / outstanding, invoices listed, rupee tiles (PO value, received value, invoiced, variance) once an amount was entered |
| 3.7 | ADMIN / STORE_GUY | Same PO | Same table, **no rupee tiles** |
| 3.8 | Any | GRN → 🖨 Print | A4 shows the paperwork and DC / Received / Damaged / Short columns |

## §4. Alerts and the live bell (OWNER, ADMIN, STORE_GUY)
| # | Role | Steps | Expected |
|---|---|---|---|
| 4.1 | OWNER + STORE_GUY (two browsers) | Store Guy confirms a GRN | Within seconds the Owner's bell shows a red count and a toast "GRN-… received · PO-…"; Owner home "Needs attention" lists it |
| 4.2 | ADMIN | Same event | Bell + home card "Deliveries received"; detail shows quantities, **never rupees** |
| 4.3 | OWNER | Click the bell item | Opens the GRN; the item disappears from the bell |
| 4.4 | STORE_GUY | A Supervisor sends a material request | Store Guy's bell: "MRN-… · material requested"; click opens the request |
| 4.5 | SUPERVISOR / QC / ATTENDANCE | Look at the top bar | **No bell** at all |
| 4.6 | OWNER | Bell → Clear all | Count goes to 0; refresh → stays 0 |

## §5. QC checklist templates (OWNER / ADMIN set up, QC uses)
| # | Role | Steps | Expected |
|---|---|---|---|
| 5.1 | ADMIN | Settings → **QC checklist templates** | Four forms: Printing 6-Colours, Lamination, Lamif Flute, Die Cutting; 10 slots 09:15–18:00 |
| 5.2 | ADMIN | Edit a form: add a parameter line, save | List updates; duplicate lines collapse to one |
| 5.3 | ADMIN | New template with no parameters | Refused |
| 5.4 | ADMIN | Deactivate a form | Marked Inactive; QC no longer sees it in the Form dropdown |
| 5.5 | QC | QC → open an order → **Checklist** → pick a form → tap a cell | Four buttons: Pass / Fail / Make Ready / Plate Err; the cell shows P / F / MR / PE |
| 5.6 | QC | Tap Plate Err | Cell PE (amber); the check appears in the QC checks table as FAIL · PLATE_ERR; Supervisor home shows the quality hold |
| 5.7 | QC | 🖨 A4 | Printed grid with ✓ / ✗ / MR / PE and signature lines |
| 5.8 | STORE_GUY | `/mis/settings/qc-templates` by URL | "You do not have access" |

## §6. Employee photo (ADMIN / OWNER)
| # | Role | Steps | Expected |
|---|---|---|---|
| 6.1 | ADMIN | Employees → Add → **Take photo** (phone camera or file) → Save | Employee created; profile shows the photo |
| 6.2 | ADMIN | Profile → Retake photo → Save photo | New face shows immediately (no stale old photo) |
| 6.3 | ADMIN | Upload a PDF or a 7 MB image | Clear error; nothing saved; no duplicate employee on retry |
| 6.4 | ATTENDANCE_OPERATOR | Web kiosk (`/mis/kiosk`) → punch that employee | The green/amber result line shows the face |
| 6.5 | ATTENDANCE_OPERATOR | Employee profile | No photo picker (read-only role) |

## §7. Android kiosk (needs the NEW APK, October 2026 build)

**Before you start:** ask the project owner for (a) the APK file, (b) the badge code of one real
attendance operator (an employee whose role is Attendance Operator or Super Attendance Operator),
(c) the badge code of an ordinary worker, and (d) one worker who has a photo and one who has none.
Install over the old app (the pairing is kept; a fresh install needs re-pairing from Settings → Gate
tablets). If the tablet was already installed with an older build, open it once with wifi on and let it sync.

| # | Steps | Expected |
|---|---|---|
| 7.1 | Health screen (hold the top bar 3 s) → sync | Sync succeeds; no crash; roster count matches Employees on the web |
| 7.2 | Sign in as operator using an **ordinary worker's** badge code | Refused: "Not an attendance operator" |
| 7.3 | Sign in using the **operator's** badge code | Signed in |
| 7.4 | Right after sign-in | You must pick a **shift** (the real shifts of the factory are listed) before scanning or typing a code is possible |
| 7.5 | Pick a shift | Shift name shows in the top bar; scanning/manual entry now works |
| 7.6 | Scan the badge (QR) of a worker **with** a photo | Confirm card shows the photo large, with name |
| 7.7 | Scan a worker **without** a photo | Confirm card shows a neutral empty-person picture (not a coloured letter) |
| 7.8 | Type the worker's code manually instead of scanning | The same confirm card (photo or placeholder) appears **before** the punch is recorded |
| 7.9 | Punch several workers in, then out | Each appears on the web Attendance within seconds, with the operator's name under "Punches" and the correct shift |
| 7.10 | Wifi off → punch 2–3 workers → wifi on | Punches are queued (counter visible), then send by themselves; no duplicates on the web |
| 7.11 | Wifi off → scan a worker with a photo | The photo still shows (cached) |
| 7.12 | Health screen → **End shift** | Operator and shift are cleared; the next person must sign in and pick a shift again |
| 7.13 | Close and reopen the app while signed in | Still signed in with the same shift (or asked to sign in again), never stuck on a blank screen |
| 7.14 | Web: Settings → Gate tablets → revoke this tablet | Tablet wipes its login and returns to pairing; it cannot punch anyone |

## §8. Also fixed in this release (found by the automated 7-role sweep) — please re-check
| # | Role | Where | Was | Now |
|---|---|---|---|---|
| 8.1 | All | Store Overview, Store Transactions, Item ledger, Audit Log, Order detail, Production detail, QC order page, QC grid | Console error "Minified React error #418" on load (dates rendered in the server's zone, then re-rendered in IST) | No console error; dates/times always in IST |
| 8.2 | All (phone width) | Customer detail, Production detail, Audit Log, QC templates, QC checklist | Page wider than the phone (horizontal scroll) | Fits the screen |
| 8.3 | QC, SUPERVISOR | Sidebar → Dashboard | "You do not have access" | Dashboard opens (the "Waiting on you" widget now appears only for Owner/Admin, who can act on it) |
| 8.4 | ATTENDANCE roles | More → Crew | "You do not have access" | Opens; the machine column is simply absent for roles without production access |
| 8.5 | QC | Production → open an order | "You do not have access" | Opens read-only (no log-entry form) |
| 8.6 | STORE_GUY | Suppliers → View | "You do not have access" | Supplier detail opens |
| 8.7 | STORE_GUY / SUPERVISOR | `/mis/kiosk` by URL | Store Guy saw "Couldn't load — try again"; Supervisor could open it | Both get the normal "You do not have access" |
| 8.8 | ATTENDANCE roles | Leave requests → Submit / Reject | List sometimes stale until reload | List updates immediately |

## §10. Round 2 — fixes made after the audit (October 2026) — please re-test

These were found by a line-by-line audit of the seven V2 features and a 7-role browser sweep.
Re-run only these rows; the earlier sections are unchanged.

| # | Role | Steps | Expected |
|---|---|---|---|
| 10.1 | Any (use a phone in **dark mode**) | Open Orders → an order → BOM, Store → Overview, Reports, Inventory item | Text is dark and readable on white cards; the screen looks the same as in light mode. (Before: numbers and labels looked faint grey.) |
| 10.2 | ADMIN / OWNER | Employees → open an employee → upload a photo | Photo saves and shows on the employee |
| 10.3 | ATTENDANCE (tablet, **rebuilt APK**) | Scan that employee's badge | Confirm card shows the photo. An employee without a photo shows the initial letter. Wifi off → photo still shows |
| 10.4 | STORE_GUY | Open a DRAFT GRN in two browser tabs; press **Confirm** in both, one right after the other | One confirms; the other says it is already confirmed. Stock rises **once** (check Store → Transactions) |
| 10.5 | STORE_GUY | Try to add or change a line on a GRN that is already CONFIRMED | Refused with a clear message; nothing changes |
| 10.6 | STORE_GUY | Receive more than the PO still has outstanding (ordered minus already received) | Refused with a clear message naming the limit |
| 10.7 | STORE_GUY | Try to confirm a GRN with no lines, or with every quantity 0 | Refused with a clear message |
| 10.8 | STORE_GUY | Store → Issue → pick an order → add an item of category **EQUIPMENT** or **OTHERS** | Refused: equipment/others are overhead, issue them to a department with no order |
| 10.9 | STORE_GUY | Store → Issue to an order that is **closed or cancelled** | Refused with a clear message |
| 10.10 | STORE_GUY | Issue a quantity with three decimals (e.g. 1.234) | Handled as 1.23; no error and no wrong balance |
| 10.11 | STORE_GUY ×2 (optional, two people) | Both issue the same item against the same order at the same moment, together more than is allocated | Only one goes through; the other is refused with the quota message. Balance never goes negative |
| 10.12 | QC | QC → open an order → **Print checklist** | Sheet shows **one day** with its date; previous-day / next-day links work; yesterday's ticks are not on today's sheet |
| 10.13 | OWNER / ADMIN | Settings → QC templates (use a phone too) | Header fits the phone width. Up/down arrows reorder parameters and templates and the order stays after refresh |
| 10.14 | OWNER / ADMIN | Rename a parameter that already has recorded checks | Refused with a clear message (history is kept); adding or reordering still works |
| 10.15 | OWNER / ADMIN | After the owner runs the template SQL: QC templates list | Four templates named *Printing Checklist*, *Lamination Checklist*, *Lamif Flute Lamination*, *Die Cutting Checklist* with the wording from the client's paper forms (e.g. Shade Matching with Shade Card, Fiber Tear Test, Box Dimensions (±0.5mm)) |
| 10.16 | OWNER | Audit log → open any row | Shows only the fields that changed, old → new. A material price change shows the real old and new price |
| 10.17 | ADMIN | Audit log → open the same rows | No ₹ amounts or rates anywhere (they are hidden for every role except Owner) |

| 10.18 | OWNER / ADMIN | Menu → **Supplier invoices** | Board lists invoices with a status: green MATCHED, amber quantity discrepancy, red price discrepancy, grey pending review. Owner sees amounts; Admin sees quantities and variance only |
| 10.19 | STORE_GUY | Menu → Supplier invoices | Sees invoices and their status only, no rupee amounts |
| 10.20 | STORE_GUY → OWNER | Receive against a PO, type the supplier invoice no. and amount, **Confirm** the GRN | An invoice appears on the board. Amount equal to received qty × PO rate (within ₹1 or 0.5%) → MATCHED; clearly different amount → price discrepancy; DC qty ≠ received qty → quantity discrepancy |
| 10.21 | OWNER / ADMIN | On the board press **Re-check match** on a pending invoice | Status updates; nothing else changes |
| 10.22 | SUPERVISOR / QC / ATTENDANCE | Open `/mis/supplier-invoices` by URL | "You do not have access" |

Note: invoices created through the Store cart receipt stay **pending review** until someone
presses Re-check match (known, intentional for now).

## §11. Round 3 — tester round 2 fixes (October 2026) — re-test only this

| # | Role | Where | Expected |
|---|---|---|---|
| 11.1 | STORE_GUY | GRN with a received line that has no catalog item → **Confirm** | Refused; the message names the line ("Line N …") |
| 11.2 | STORE_GUY | Confirm a good GRN → Store → Stock / Transactions | The receipt shows as an IN row; stock balance matches |
| 11.3 | STORE_GUY | Store out more than the balance | Refused with "Cannot issue more than the stock balance (X available)"; no reason field |
| 11.4 | STORE_GUY | Physical count → **Reconcile** (needs a reason) | Stock adjusts once; a second reconcile of the same count is refused |
| 11.5 | STORE_GUY | Draft GRN: edit / remove a line; **Discard draft** | Works on DRAFT only; confirmed GRNs refuse |
| 11.6 | STORE_GUY | Raise a material request | Store Guy, Admin and Owner all get the bell; Admin/Owner can approve |
| 11.7 | ADMIN | Create a PO for an order whose BOM is not approved | Popup "BOM is not approved"; BOM Ref is a picker of approved orders only |
| 11.8 | ADMIN | PO: submit with no lines; edit header; delete a draft; cancel a received PO | No-lines submit disabled; edit/delete work on DRAFT; cancel refused once receiving |
| 11.9 | ADMIN / OWNER | BOM: reject a pending BOM with a reason; edit/delete a DRAFT stage or material | Back to DRAFT with the reason; edits only on DRAFT |
| 11.10 | ADMIN | Order → Start production / Mark complete / Cancel | Complete lists unmet gates; override needs a reason (Owner/Admin); cancel needs a reason |
| 11.11 | STORE_GUY / ADMIN | Receive goods and Add Item | No rate / price field (Owner only) |
| 11.12 | QC | Open PO / GRN URLs | Denied; no PO/GRN menu |
| 11.13 | ADMIN | Order traceability | Shows linked POs/GRNs and issued materials, no rupee amounts |
| 11.14 | SUPERVISOR | Production log / QC check | Unit is a dropdown; optional BOM stage; operators are floor staff only; machine pre-filled |
| 11.15 | SUPERVISOR | Sign off a phase | Its machine shows FREE on the board |
| 11.16 | any | Create a duplicate supplier / customer / master code | Clear message ("… already exists"), no technical error |
| 11.17 | any | Master / detail screens | Back button present; Day Timeline has a machine-name search; login shows a show-password eye |
| 11.18 | ADMIN | Employees list | Department column; manager dropdown shows name, code and role |
| 11.19 | KIOSK | New APK: retry sync, revoked device, stale IN after a new day | Retry shows success/failure; revoked device returns to pairing; next day defaults to IN with a toggle |

## §13. Round 4 (R3 deploy 1) — re-test only this

| # | Role | Where | Expected |
|---|---|---|---|
| 13.1 | STORE_GUY | GRN receiving 2% over the PO qty, then 3% over | 2% allowed; 3% refused with the max shown |
| 13.2 | STORE_GUY | Receive the last of a PO | PO shows COMPLETE and leaves the GRN picker |
| 13.3 | STORE_GUY | Issue more than stock; double-tap Confirm on the cart | Refused; books once |
| 13.4 | STORE_GUY | Inventory adjust without a reason | Reason required (3+ characters) |
| 13.5 | STORE_GUY | Orders / Customers / Dashboard / Order detail | All open, read-only, no prices, no error page |
| 13.6 | ADMIN | Over-receipt override | Needs a reason |
| 13.7 | ADMIN | Create a PO line with a rate | Rate ignored (unpriced); PO needs Owner approval |
| 13.8 | OWNER | Approve that PO | Refused until every line is priced; Owner can set rates while PENDING |
| 13.9 | ADMIN | Change an employee wage code / pay type; deactivate the Owner row; assign Admin role | All refused |
| 13.10 | ADMIN | Business rules (PO approval threshold) | Not editable by Admin |
| 13.11 | ADMIN | Import a sheet with Name + Code only | Category and unit unchanged |
| 13.12 | ADMIN | New item | Next ITM- code; code editable; GSM / Size / Unit are dropdowns |
| 13.13 | ADMIN / OWNER | Cancel an order with a machine and crew booked | Machine and crew freed; stock reservations released |
| 13.14 | ADMIN | Complete an order with no production logged | Refused unless Owner/Admin override with reason |
| 13.15 | OWNER | Payroll for a month incl. MONTHLY staff with no attendance; department extra-pay day; half-day festival pay; closing a future month | Staff listed; dept day paid; half pay; future close refused |
| 13.16 | OWNER | Legacy issues report | Lists the old STORE_ISSUE rows (about 36) |
| 13.17 | OWNER | CoA for an order whose failure was later fixed; for a non-completed order | PASS; DRAFT banner |
| 13.18 | SUPERVISOR | Crew: staff tomorrow, move a worker, assign someone on leave or double-booked, copy yesterday | Works; overlap and leave blocked (Admin can override with reason) |
| 13.19 | SUPERVISOR | Sign off a phase | Machine AND crew freed |
| 13.20 | SUPERVISOR | Production entry: edit within 24h; log on an unbooked machine; mixed units | Edit works then refused; amber warning; totals per unit |
| 13.21 | SUPERVISOR | Add an attendance note; add a QC check | Allowed |
| 13.22 | QC | AQL sample size 0; edit a check within 24h; pass rate with N/A rows | Refused; allowed; N/A ignored |
| 13.23 | ATTENDANCE | Duplicate leave; self-approve leave; mark-absent after punches; edit outside the correction window | Refused; skips people who punched; refused |
| 13.24 | KIOSK (new APK) | Night-shift worker at 05:30; revoked tablet with queued punches; stuck entry | Defaults to OUT; queued punches sent before wipe; stuck row listed with Retry |

## §14. Round 2 — Batch 2 (release 2026-10-19) — re-test only this

| # | Role | Where | Expected |
|---|---|---|---|
| 14.1 | ADMIN | R2-02: Items: open New item; check GSM, size, substrate, coating, unit; add a new option via '+ Add new' | All are dropdowns from master options; the new option is saved and selectable |
| 14.2 | SUPERVISOR | R2-25: Open an item attribute dropdown (e.g. size, unit) | Options listed; there is no '+ Add new' for Supervisor |
| 14.3 | ADMIN | R2-84: Inventory → Add Item: pick substrate and coating; add a unit inline | Substrate and coating present; new unit saved and selectable |
| 14.4 | ADMIN | R2-85: Items screen and Inventory Add Item: use the searchable unit/attribute selects | Type to filter; same options in both screens |
| 14.5 | ADMIN | R2-10: BOM: add a material and link it to a catalog item (search by name) | Searchable catalog link saves and shows on the BOM line |
| 14.6 | ADMIN | R2-82: Any form with Item, Unit, Machine, Operator or Order picker: type to filter | Searchable select narrows as you type |
| 14.7 | ADMIN | R2-83: Open PO, GRN, Supplier Invoices, Orders, Inventory, Employees, Audit, Store transactions, Leave, Extra-pay, Daily register; go to page 2 after searching/filtering | 25 rows per page; URL keeps q and filters; footer reads '26-50 of N' |
| 14.8 | ADMIN | R2-81: Open Supplier Invoices on a wide screen | Page uses the full width |
| 14.9 | QC | R2-37: Log in; open PO and GRN lists and a detail page | Lists and detail open read-only; no write buttons |
| 14.10 | SUPERVISOR | R2-38: Go to /mis/store/issue | Shows 'Raise a request instead'; no 403/500; no issuing |
| 14.11 | SUPERVISOR | R2-80: Raise a material request / issue with no order | Only allowed as 'General / factory use' with a reason and cost centre; tagged GENERAL, 'not linked to any order'; Owner and Admin get a bell notice |
| 14.12 | STORE_GUY | R2-64: Open the Store sidebar | Grouped menu: Dashboard, Goods Issue, Receipts, Transactions |
| 14.13 | STORE_GUY | R2-66: Issue cart: click 'Refresh stock'; let a line go stale then Confirm | Stock refreshes; a stale line blocks Confirm until refreshed |
| 14.14 | SUPERVISOR | R2-67: Raise a request; Store approves, rejects, or hands over | Supervisor gets a bell notice for each decision |
| 14.15 | STORE_GUY | R2-77: Approve a request for picking → /mis/store/pick-lists → save picks → staged → hand over | Stock moves only at handover, not before |
| 14.16 | STORE_GUY | R2-79: /mis/store/returns: return material as store guy; also as supervisor | Store-guy return books stock back at once; supervisor return stays pending until store accepts |
| 14.17 | STORE_GUY | R2-68: Store Issue/Receive cart: tap Scan (real device, Chrome/Android) | Camera scans an item barcode into the cart; typing works as fallback |
| 14.18 | STORE_GUY | R2-78: Receive cart: tap Scan on a real device | Camera scan adds the item; typed fallback works |
| 14.19 | ATTENDANCE | R2-105: Web Kiosk: tap Scan for an employee on a real device | Camera scan identifies the employee; typed fallback works |
| 14.20 | STORE_GUY | R2-74: GRN: confirm a line with no DC quantity (also via direct submit) | Refused by the server; DC quantity required |
| 14.21 | SUPERVISOR | R2-40: Log production on a machine with no booking | Board shows the machine BUSY from the production log |
| 14.22 | SUPERVISOR | R2-41: Log a second production on the same machine and time for a different order | Refused with a clear message |
| 14.23 | SUPERVISOR | R2-45: Check machine board and utilisation after an unbooked production log | Board and utilisation match the log (source = production log) |
| 14.24 | SUPERVISOR | R2-47: Crew board: view Available vs Blocked; another supervisor tries to take a held worker; holder/Admin/Owner release | Blocked shows machine and holder; other supervisor refused; holder, Admin or Owner can release |
| 14.25 | ADMIN | R2-46: COA / job card: Issue Vn, then Approve; try as the preparer; open the file name | Preparer cannot approve; Admin/Owner can; file named COA_ORD_DDMMYY_Vn; reprint shows version and status |
| 14.26 | ADMIN | R2-17: Production log: edit and delete a row within 7 days with a reason; as SUPERVISOR try edit at <24h and delete | Admin edit/delete works with reason; Supervisor can edit within 24h, no delete |
| 14.27 | QC | R2-34: Edit and delete your own QC check same day; try yesterday's and someone else's; then as Admin/Owner within 7 days | QC own same-day only; Admin/Owner allowed within 7 days; reason audited |
| 14.28 | SUPERVISOR | R2-48: Production log: enter makeready minutes | Saved and shown on the log |
| 14.29 | ATTENDANCE | R2-101: Leave range Fri–Tue; approve; apply an overlapping leave | Shows 4 working days; approval writes the register; overlap refused |
| 14.30 | ATTENDANCE | R2-102: Apply leave of each type CL, SL, EL, LWP, Other | Types recorded and shown (payroll paid/unpaid rules not yet applied) |
| 14.31 | ADMIN | R2-88: Open an employee profile | Edit Employee button present and works |
| 14.32 | OWNER | R2-89: Open an employee profile | View Payslip link is present for Owner |
| 14.33 | OWNER | R2-116: Extra-pay: search by name; check the Proposed by column | Search filters rows; Proposed by is shown |
| 14.34 | OWNER | R2-110: Add/Edit employee bank fields (Owner/Admin only); month end: 'Download bank transfer file' | IFSC pattern and account 9–18 digits validated; file Owner only; employees without bank details are listed |
| 14.35 | OWNER | R2-111: Close a past month → Send payslips; then as an employee: Me → My payslips; try the current month | Employee sees only own sent past-month slips; current month returns 404 |
| 14.36 | OWNER | R2-109: Payroll: Print all payslips | All payslips open in one print view |
| 14.37 | OWNER | R2-114: Settings → Wages: Edit details; view history | Details saved; rate history listed |

## 15. Round 2 — Batch 3 (release 2026-10-20) — re-test only this

| # | Role | Where | Expected |
|---|---|---|---|
| 15.1 | OWNER | R2-102: Settings > Leave pay: see every leave type (CL, SL, EL, LWP, Other) | All start Unpaid; Owner can toggle each to Paid; change is audited and history kept |
| 15.2 | OWNER | R2-102: Approve a CL leave for a daily worker; open payroll for that month | Payroll basic does not change while CL is Unpaid |
| 15.3 | OWNER | R2-102: Set CL to Paid in Settings > Leave pay; recheck the open month payroll | Basic rises by exactly one day rate for the approved CL day |
| 15.4 | OWNER | R2-102: Flip CL back to Unpaid | Payroll basic drops back by one day rate |
| 15.5 | OWNER | R2-102: Toggle a leave type, then view a closed (past) month payroll | Closed month figures are unchanged |
| 15.6 | ADMIN | R2-102: Open Settings > Leave pay and try to change a type | Refused with 403; Admin cannot change |
| 15.7 | ADMIN | R2-46: Approve COA/job card V1 (different user from preparer); change a QC check; reprint | Page and file name (_V1) unchanged; content still the frozen V1 |
| 15.8 | ADMIN | R2-46: Click 'Update to latest' (Admin or Owner) | V2 created as PREPARED; needs a different approver than the preparer |
| 15.9 | ADMIN | R2-46: Open the document with ?v=1 | Older V1 snapshot is viewable |
| 15.10 | ADMIN | R2-46: Open a legacy approved COA/job card (approved before this release) | Prints live data with a 'No snapshot' note |
| 15.11 | ADMIN | R2-82: Items > Add: type in Unit, GSM, Size, Substrate, Coating | Each is a searchable dropdown that filters as you type; '+ Add new' available inline for Admin |
| 15.12 | SUPERVISOR | R2-82: Open the same item dropdowns | Options listed and searchable; no '+ Add new' |
| 15.13 | STORE_GUY | R2-68/78/105 camera scanning (REAL Android Chrome device only): store issue cart Scan button; receive cart Scan; kiosk Scan with camera | Camera scans the barcode/employee; typed entry fallback works. Not testable on desktop or emulator |

### UI smoke checklist (one line each; tick when it opens and works)

1. Orders list: pagination works, page 2 after a filter
2. Store pick list: save picks, staged, hand over
3. Returns: store-guy return books stock back at once
4. General-use issue: reason and cost centre required
5. Worker lock board: Available vs Blocked, release
6. Payroll bank file: Owner can download, others cannot
7. Bulk payslips: Print all opens in one view
8. Leave range: Fri to Tue shows working days only
9. Kiosk: identify an employee by typing the code
10. My payslips: employee sees only own sent past months

## §9. Report
Use the Bug template from `EXTERNAL_TESTER_GUIDE.md` §8: what you did, what you expected, what
happened, role, device/width, time.
