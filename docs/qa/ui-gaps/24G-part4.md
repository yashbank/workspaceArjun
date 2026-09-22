# Phase 24G — Part 4 (store & purchasing) UI gaps

Screens owned: `/mis/store`, `/mis/store/dashboard`, `/mis/store/stock`, `/mis/store/receive`,
`/mis/store/issue`, `/mis/store/count`, `/mis/store/transactions`, `/mis/store/ledger/[itemId]`,
`/mis/inventory`, `/mis/inventory/[itemId]`, `/mis/grn`, `/mis/grn/[id]`, `/mis/po`, `/mis/po/[id]`,
`/mis/suppliers`, `/mis/suppliers/[id]`, `/mis/print/grn`, `/mis/print/po`.

Compared against the design language (06-MasterTable, 07-Slide-over-dialog, 04-Inputs,
05-Badges-status, 08-Empty-error-offline, R-series phone cards, D10, W2-PO-capture) at
390/768/1024/1440, the real-browser shots in `.tmp-wt/gA/shots` and `.tmp-wt/gB2/shots`, and the
measured metrics in `.tmp-wt/gA/*.json` / `.tmp-wt/gB2/STORE_GUY.json`.

| ID | Screen | Roles | Width | What differs from the design | Severity | Status |
|---|---|---|---|---|---|---|
| G4-01 | `/mis/store/transactions` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390 | The `Item` DataTable column (name + code, two lines, no width constraint) is a *secondary* column, so on the mobile card it sits inside `CardRow`'s `justify-between` flex row with no width of its own — every one of the 31 filtered rows pushed its Item block past the 390px edge (measured as `clippedRight: 31` in the phase's browser walk; `overflowPx` stayed 0 because the page itself never grew a scrollbar, only individual rows did). Only visible at 390 — at ≥768 `DataTable` switches to the desktop `<table>`, which isn't affected. | Major | **Fixed** — capped the column to `max-w-[160px]` with `truncate` on both lines, matching the Reference/Reason column right next to it. Guard test: `store-tap-targets.test.ts` (G4-01). |
| G4-02 | `/mis/store` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390/768/1024/1440 | "Dashboard" link and "↓ CSV" button were hand-rolled (`px-3 py-2 text-sm border …`, no kit `Button`) and measured 38px tall — under the 44px tap-target rule. | Minor | **Fixed** — `inline-flex min-h-11 items-center justify-center`. |
| G4-03 | `/mis/store` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390/768/1024/1440 | The row-level "Deactivate" link (`text-xs … px-2 py-1`) measured ~24px tall, next to a full-size "Edit" button — a small, easy-to-mis-tap target for a destructive action. | Minor | **Fixed** — `inline-flex min-h-11 items-center`. |
| G4-04 | `/mis/store/dashboard` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390/768/1024/1440 | "All Items", "Full Log", "Stock Report" links (38px) and "View all" (20px) were all under 44px. | Minor | **Fixed** for all four. |
| G4-05 | `/mis/store/stock`, `/mis/store/ledger/[itemId]`, `/mis/store/transactions` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390/768/1024/1440 | The "↓ CSV" button on each of these three screens was hand-rolled at 38px tall (the corresponding buttons on `/mis/grn`, `/mis/po` and `/mis/suppliers` already use the kit `Button` and are fine). | Minor | **Fixed** — same `inline-flex min-h-11` treatment on all three. |
| G4-06 | `/mis/inventory` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390/768/1024/1440 | "↓ CSV", "↓ Excel Template", "↑ Import CSV" all measured 38px tall. | Minor | **Fixed**. |
| G4-07 | `/mis/inventory` | OWNER, STORE_GUY (canWrite) | 390 | Toolbar cramped: search box + CSV shared one flex-wrap row, then Excel Template + Import CSV wrapped onto a second row, then "+ Add Item" wrapped onto a third, full-width row alone — an uneven, hard-to-scan stack (see `OWNER-390-_mis_inventory.png`). | Minor | **Fixed** — search now sits on its own full-width row; the four action buttons sit in a second row that wraps evenly (`flex flex-wrap gap-2`), all at 44px. |
| G4-08 | `/mis/suppliers/[id]` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390/768/1024/1440 | Breadcrumb "Suppliers" link measured 20px tall (it's a flex item, so it isn't `display: inline` and the tap-target check catches it, unlike a plain-text breadcrumb link). | Minor | **Fixed** — `inline-flex min-h-11 items-center`. |
| G4-09 | `/mis/store/ledger/[itemId]` | OWNER, ADMIN, SUPERVISOR, STORE_GUY | 390/768/1024/1440 | Same breadcrumb pattern ("Store / Stock / item name") as G4-08 but as plain inline text, so the automated check doesn't flag it — the tap area is still just the line-height of the text. | Minor | **Fixed proactively** for consistency — wrapped in `nav`, `inline-flex min-h-11 items-center` on both links. |
| G4-10 | `/mis/store/issue`, `/mis/store/receive` | all | 390/768 | A / अ language toggle buttons measure 40×40, under the 44px rule. | Minor | → **PART 1** (shared `LangToggle`, `src/components/mis/shell/lang-toggle.tsx` — shell file, not owned by Part 4). |
| G4-11 | `/mis/store/receive` | STORE_GUY | all | The RECEIVE cart (`item-cart.tsx`) shows a "₹ rate" input per line so a storekeeper can record what was actually paid on a delivery that has no PO. STORE_GUY holds `store.write` but not `wages.read`, so this is a **write**, not a read, of a price — D24's decided rule is about the server not *sending* an existing price to a non-Owner; it explicitly leaves "WRITING a price" undecided and unenforced (F-15, `docs/DECISIONS.md` D24 "Applied" row). The field never pre-fills from `pricePerUnit`, so no existing price leaks. | Info | **Left** — this is a known, already-tracked policy gap (F-15), not a UI render leak; closing it needs a product decision ("may a non-Owner store write a rate?"), not a UI-only fix, and is out of scope for this ticket (no permission/server changes allowed). |
| — | `/mis/approvals` "View PO" | — | — | Out of scope — belongs to Part 2. Not touched. | — | N/A |

## Checked and already correct (no gap)
- STORE_GUY never sees a price/₹ anywhere in the store or inventory screens checked
  (`store-item-screen.tsx`, `store-stock-screen.tsx`, `po-detail-screen.tsx`): every money
  column/field is gated on `isOwner`/`seesMoney`, and is **absent**, not greyed out (D24).
  PO's "Add Item" rate field is unreachable by STORE_GUY (`po.write` is Owner/Admin only).
- GRN screens (`grn-list-screen.tsx`, `grn-detail-screen.tsx`) never mention money at all.
- Filter search boxes and `<select>`s across store/inventory/grn/po/suppliers screens are
  already 48px (`min-h-12`) with 16px text (`text-base`) — covered by the existing
  `search-inputs.test.ts` guard.
- `issue-screen.tsx` / `receive-screen.tsx` / `item-cart.tsx`: cart step buttons are 48×48
  (`h-12 w-12`), chips are `min-h-11`, the empty state ("Scan or search an item to start") is
  honest and uses the kit `EmptyState`, and the sticky confirm bar is full-width with a clear
  disabled state. No changes needed.
- `/mis/grn`, `/mis/po`, `/mis/suppliers` list screens already use the kit `Button` for their
  "↓ CSV" action (44px) — only the store/inventory screens (G4-05, G4-06) had drifted to a
  hand-rolled 38px button.

## Files changed
- `src/components/mis/store/store-transactions-screen.tsx` (G4-01, G4-02 CSV button)
- `src/components/mis/store/store-item-screen.tsx` (G4-02, G4-03)
- `src/components/mis/store/store-dashboard-screen.tsx` (G4-04)
- `src/components/mis/store/store-stock-screen.tsx` (G4-05)
- `src/components/mis/store/store-ledger-screen.tsx` (G4-05, G4-09)
- `src/components/mis/inventory/inventory-screen.tsx` (G4-06, G4-07)
- `src/components/mis/suppliers/supplier-detail-screen.tsx` (G4-08)

## Test added
- `src/components/mis/store/store-tap-targets.test.ts` — source-scanning guard: asserts the
  Item column in `store-transactions-screen.tsx` stays width-capped/truncated (G4-01), and that
  each of the 13 fixed links/buttons still carries `min-h-11` (G4-02…G4-08). Verified it fails
  without the fix (reverted one target, confirmed red, restored).
