# Round 2 — Owner decisions (what was built and why)

Source of truth for the R2 fix batch #2. Agents build to this; the tester reads it to understand intent.

| ID | Decision |
|---|---|
| R2-37 | QC role may VIEW (read-only) GRN and PO. No write. |
| R2-38 | Supervisor may NOT issue stock. Supervisor raises a Material Request; Store Guy issues. Supervisor gets a clear "Raise a request instead" message, not a 403/500. |
| R2-40/41/45 | Saving a production log on a machine AUTO-SYNCS the machine board: if no allocation covers that machine/time, one is created (source = production log) so board and utilisation match reality. Overlapping logs on a machine with a different running order are rejected with a clear message. |
| R2-47 | HARD worker lock. A worker already allocated to a machine cannot be assigned elsewhere until a supervisor releases them. Supervisors see Available vs Blocked workers (blocked shows machine + holder). Only the holder supervisor, Admin or Owner can release. |
| R2-46 | Document versions (COA, job card): each print/issue is versioned (v1, v2…) with a two-level sign-off (prepared → approved). Reprint shows version + status. |
| R2-111 | Employees do NOT self-serve payslips. Owner SENDS (releases) a payslip to an employee; the employee can then view/download released slips for PREVIOUS months only (never the current month). |
| R2-17/34 | Production log and QC check rows get Edit + Delete. Admin/Owner: within 7 days of the entry. QC inspector: own QC checks, same day only. All edits audited with reason. |
| R2-02/25/84/85 | Item attributes (GSM, size, substrate, coating, unit) are dropdowns fed by master options; Admin can add new options/units inline. Items screen and Inventory Add Item both include substrate + coating. |
| R2-77 | Pick & Staging flow: approved Material Request -> Pick List -> Store Guy picks -> Staged -> handed to supervisor (stock moves ONLY on handover). |
| R2-79 | Return-to-Store: supervisor/store guy returns unused/rejected material from floor with a reason; stock is reversed to store, audited. |
| R2-68/78/105 | Camera barcode/QR scanning: item scan on Store Issue/Receive cart; employee scan on Web Kiosk. Falls back to typing. Needs real-device test. |
| R2-110 | Employees get bank account no. + IFSC (+ bank name). Month-end export adds a bank transfer CSV (Owner only). |
| R2-80/62/Q11 | An issue / material request with no order is allowed ONLY as "General / factory use" (grease, oil, consumables): requires a reason + cost-centre/reason code, is tagged GENERAL, shown as "not linked to any order", and Owner + Admin are NOTIFIED when it is raised/approved. Store Guy or Owner can approve. |
| R2-83 | Server-side pagination (page size 25, search/filter kept) on PO, GRN, Supplier Invoices, Orders, Inventory, Employees, attendance lists, audit/transaction lists. |
| R2-101/102 | Leave: date range (multi-day) + types CL, SL, EL, LWP (+ Other). |
| R2-82/85 | Searchable combobox (type to filter) replaces native selects for Items, Units, Machines, Operators, Orders. |
| R2-64 | Store sidebar grouped: Dashboard, Goods Issue, Receipts, Transactions. |
| R2-66/67 | Cart refreshes stock on focus/before commit; Supervisor notified when Store decides a request. |
| R2-81 | Supplier invoices page uses full width. |
| R2-88/89 | Employee profile: Edit button + payslip link (Owner). |
| R2-109/114/116 | Bulk payslip print; wage-type metadata edit + rate history; extra-pay search + proposer column. |
| R2-10 | BOM materials can link to a catalog item (searchable). |
| R2-48 | Makeready minutes captured on production log. |
| R2-74 | DC quantity required on the server for GRN lines. |

## Test-contract changes

Existing tests whose assertions (not just inputs/mocks) changed in this batch, and why. Every other modified test only gained newly-required inputs (supplier on PO — R2-69; DC qty/number — R2-73/74; general-use reason + cost centre — R2-80) or mocks for new reads (counts for R2-83 paging, document versions R2-46, worker locks R2-47, cost centres, `calculateEmployeePayroll` R2-112).

- `lib/mis/notification-copy.test.ts`, `server/mis/notifications.test.ts` — Supervisor joins the bell; two new types (decided, general use). R2-67 / R2-80.
- `server/mis/qc-no-purchasing.test.ts`, `lib/mis/permissions.test.ts`, `server/mis/navigation.test.ts`, `server/mis/material-money.test.ts`, `app/(mis)/mis/grn/page.test.tsx` — QC may view PO/GRN read-only (`po.view` / `grn.view`); writes, suppliers, 3-way match still refused. R2-37.
- `server/mis/r3-sec-pages.test.tsx` (B39 audit page) — `limit` clamp replaced by 25-row pages (`page` → `skip`). R2-83.
- `server/mis/r3-prd-logic.test.ts`, `server/mis/r3-qcr-qc.test.ts` — edits need a reason; QC edits only own checks, same factory day. R2-17/34.
- `server/mis/attendance-punch.test.ts` — late/OT minutes now derived from punches vs shift (was "never computed here", D20); waived lateness survives clock-out. Tracker R2-106 / R2-103.
- `app/(mis)/mis/print/payslip/payslip-id-guard.test.ts` — payslip computes one employee, not the whole payroll. Tracker R2-112.
- `server/mis/audit-payloads.test.ts` — counts +1 (`wageType.updateDetails`, `calculateEmployeePayroll`), same safety loop. R2-114 / R2-112.
- `server/mis/r3-stk-actions.test.ts` — `commitIssueAction` returns a worded refusal instead of throwing. Tracker R2-76 (with R2-38).
- `server/mis/store-integrity.test.ts`, `server/mis/material-request-integrity.test.ts` — a no-target issue/request now fails the R2-80 target check first; the original "equipment must go to a department" (and "raw material needs no department") assertions were restored on the general-use path.
- `server/mis/r3-mst-po.test.ts` — B27 "no supplier at submit" now seeds a legacy supplier-less PO, since create requires one. R2-69.
- `server/mis/production.test.ts` — unchanged; the code was fixed instead: a production log's auto-created board block (R2-41) now rides in the log's own `LOG_PRODUCTION` audit row (`after.autoAllocation`), so one commit = one audit event (MIS-154). The new `r2-production-board-sync.test.ts` asserts that shape.
