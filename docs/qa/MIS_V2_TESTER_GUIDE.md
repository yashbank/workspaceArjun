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

## §8. Report
Use the Bug template from `EXTERNAL_TESTER_GUIDE.md` §8: what you did, what you expected, what
happened, role, device/width, time.
