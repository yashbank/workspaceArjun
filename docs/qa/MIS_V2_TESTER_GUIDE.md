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

## §7. Android kiosk (needs the rebuilt APK)
| # | Steps | Expected |
|---|---|---|
| 7.1 | Sync the roster (health screen → sync, or reopen the app) | Sync succeeds; no crash |
| 7.2 | Scan / enter the badge of an employee with a photo | Confirm card shows the photo (large square) beside the name |
| 7.3 | Employee without a photo | Confirm card shows the initial letter as before |
| 7.4 | Turn wifi off → scan again | Photo still shows (cached with the roster) |

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

## §9. Report
Use the Bug template from `EXTERNAL_TESTER_GUIDE.md` §8: what you did, what you expected, what
happened, role, device/width, time.
