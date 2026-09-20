# Change note — a Purchase Order without a BOM

**Client instruction (Arjun, Sep 2026, on the process flowchart):**

> "In the Purchase Order - can be created even without the BOM request, as sometimes we have to keep some additional buffer stock. Rest all looks ok in the flow chart"

**Reading.** The flow assumed one entry point: customer order → BOM / material
request → PO. There are now **two**, and they are equals. The second raises a PO
purely to top up stock the factory keeps on hand — no BOM, no customer order
behind it. This is an addition. The BOM path is unchanged, and "no BOM" must
never be treated as an incomplete record to be chased.

```
                 ┌──────────────────────────────────────────────┐
 Customer order ─┤ BOM / material request ─→ PO (FOR_ORDER)     │
                 │                            bom_ref = "…"     ├─→ Approval ─→ Supplier ─→ GRN ─→ Inventory
 Stock policy ───┤ (nothing)              ─→ PO (BUFFER_STOCK)  │
                 │                            bom_ref = NULL    │
                 └──────────────────────────────────────────────┘
```

Everything downstream of "Approval" is identical for both. The paths differ only
in what starts them and what the PO carries.

---

## 1. Where the assumption lived

| Place | Did it block a BOM-less PO? | What was done |
|---|---|---|
| `prisma/schema.prisma` — `MisPurchaseOrder.bomRef` | **No.** `String?`, nullable, no FK, no `MisBom` relation | Nothing. Confirmed correct as-is |
| `prisma/schema.prisma` — `MisPurchaseOrder.orderId` | No such column exists | Nothing |
| `src/server/mis/po.ts` `createPO` | No — passed `bomRef` straight through | Added a purpose, and validation that pairs it with `bomRef` |
| `src/server/mis/po.ts` `submitForApproval` / `approvePO` | No — status-only transitions, never read `bomRef` | Nothing |
| `src/server/mis/bom.ts` | No — BOM never reaches toward a PO | Nothing |
| `src/server/mis/business-rules.ts` | No — generic key/value store; no PO rule seeded | Nothing |
| `src/server/mis/approvals.ts` | No — queries `status = PENDING_APPROVAL` only | Nothing (screen now shows purpose) |
| `src/server/mis/store.ts` `commitReceipt` | No — a receipt with no PO at all already posts to the ledger | Carried `purpose` onto `OpenPoRow` |
| `src/server/mis/reports.ts` | No PO reporting exists yet | Nothing — see §5 |
| PO list / detail / print screens | No, but the UI **implied** a BOM: a bare "BOM Ref" text box and no way to say "there isn't one" | Purpose picker + purpose stated on every surface |
| Flowchart / BRD / process docs in the repo | **None found.** `brd/` and `docs/` at repo root describe the older file-workspace product; there is no `.md`/`.mmd`/`.drawio`/`.svg` in the repo mentioning PO or BOM, and no `MarkDowns/09_BRD.md`. The MIS process spec lives in Jira (epic MIS-273) and `app/docs/MIS_UI_SPEC.md` | Updated both of those instead |

**Live data check** (Supabase, read-only): `mis_purchase_orders` holds 12 rows —
10 with a `bom_ref`, **2 already with `bom_ref IS NULL`**. The BOM-less PO exists
in production today and nothing rejected it. This change makes it deliberate and
legible rather than making it possible.

---

## 2. Verdict on the schema

**No schema change is required.** `mis_purchase_orders.bom_ref` is nullable and
unconstrained; nothing in Prisma, the server modules or the approval path ever
demanded a BOM. The gap was never structural — it was that the app gave the
raiser no way to *declare* the second path, so a blank BOM Ref was ambiguous
between "buffer stock" and "somebody forgot to type it".

That ambiguity is now closed at the point of entry rather than with a column:
`createPO` refuses `FOR_ORDER` without a reference and nulls the reference on
`BUFFER_STOCK`. A null `bom_ref` therefore *means* buffer stock.

An optional stored enum is drafted and **not applied** — see §6.

---

## 3. Files changed

| File | Change |
|---|---|
| `src/lib/mis/po-purpose.ts` | **New.** `PoPurpose = 'FOR_ORDER' \| 'BUFFER_STOCK'`, `poPurpose(po)` derived from `bomRef`, `poPurposeLabel()`. Pure and client-safe — lives in `lib/` so `'use client'` screens never pull Prisma into the browser bundle |
| `src/server/mis/po.ts` | Re-exports the helpers; `PoInput.purpose?`; `createPO` validates the pairing, strips a stale `bomRef` on `BUFFER_STOCK`, and throws a message that points at the buffer-stock path when a `FOR_ORDER` PO has no reference. Purpose defaults from `bomRef` so existing callers are unaffected |
| `src/app/(mis)/mis/po/actions.ts` | `createPoAction` accepts `purpose` |
| `src/components/mis/po/po-list-screen.tsx` | Purpose `Select` as part of New PO (BOM Ref shown and required only for `FOR_ORDER`); Create disabled until a `FOR_ORDER` PO has a reference; new **Purpose** column; CSV gains Purpose + BOM Ref; empty-state copy names both paths |
| `src/components/mis/po/po-detail-screen.tsx` | **Purpose** card row, always shown |
| `src/app/(mis)/mis/print/po/[id]/page.tsx` | Printed PO always states its purpose |
| `src/components/mis/approvals/approvals-screen.tsx` | Approval row subtitle reads `supplier · purpose`, so nobody signs a buffer-stock PO thinking a customer is waiting |
| `src/server/mis/store.ts` | `OpenPoRow.purpose`, populated in `listOpenPOs` |
| `src/components/mis/store/receive-screen.tsx` | `ReceivePo.purpose`; the PO chip detail reads "buffer stock" |
| `docs/MIS_UI_SPEC.md` | New §6 "Purchase orders — two paths, both normal" |
| `prisma/migrations-pending/20260915000000_mis_po_purpose/migration.sql` | **New, not applied.** The optional enum column (§6) |

Verified: `node_modules/.bin/tsc --noEmit --skipLibCheck | grep -v seed-demo` →
clean, before and after. `next build` was not run (macOS SWC binaries vs the
Linux shell, per the brief).

---

## 4. Jira

| Key | What changed |
|---|---|
| **MIS-273** (E9 epic) | "purchase orders raised from a BOM" → the two-path flow, quoting Arjun; note that buffer stock picks up its For-order/General classification on **issue**, not on purchase; Owner reporting gets a Buffer-stock group |
| **MIS-275** (BE · PO model + approval chain) | Opens with both paths; `purpose` documented as derived, with the stored-enum decision deferred and pointed at this note; explicit "nothing may reject or flag a PO for having no BOM"; new acceptance criteria both ways |
| **MIS-277** (FE · Store dashboard + GRN verify) | Both PO kinds in one list, chip reads "buffer stock", line classification defaults to **General** on a buffer PO, never sorted lower or hidden |
| **MIS-278** (FE · PO raise/approve + Owner view) | Purpose picker as the form's first decision; Buffer-stock group in the Owner view; "a buffer-stock PO must never render as an error state"; reuse `poPurposeLabel()` |
| **MIS-279** (QA) | Six new cases: buffer PO end-to-end, `FOR_ORDER` with empty ref refused, stale ref stripped on switch, classification-on-issue, no surface shows it as incomplete, legacy null-`bom_ref` rows read as buffer stock |
| **MIS-295** | **Created** — "E9-07 · Raise a buffer-stock PO — no BOM behind it", same project/epic family as the other E9 tickets, carrying the client quote, the work done, and what was deliberately deferred |

Checked and deliberately **not** changed: MIS-99…MIS-134 (epic E5). Those use
"PO" for the **customer's** purchase order arriving *into* the business
(MIS-108 "Customer purchase order capture", MIS-129 "PO → order → BOM → job
card"). That is a different object from the supplier PO Arjun is talking about,
and its BOM-follows-order sequence is unaffected. Worth confirming with Arjun
that he meant the supplier PO — the flowchart wording makes that near-certain,
but the project uses one word for two things and that will bite someone.

---

## 5. Second-order effects

**Fixed here**

1. **Approval queue legibility** — an Owner approving spend can now see which POs
   are for a waiting customer and which are stock policy.
2. **Store receive** — the storekeeper can tell a buffer delivery from an order
   delivery at the chip, before signing.
3. **Print** — the paper PO going to the supplier states its purpose.

**Reported, not fixed**

4. **Approval thresholds.** `approvePO` has a single gate (`po.write`, plus
   `isOwner` on the queue screen). MIS-275's designed `approvalMode`
   (`OWNER_ONLY | ADMIN_ONLY | BOTH`) is not built yet. When it is, purpose is
   the obvious second axis — buffer stock is discretionary spend with no revenue
   attached, and an Owner may well want a lower auto-approve ceiling on it than
   on materials a customer is waiting for. Needs an explicit decision from Arjun,
   and probably the stored enum in §6 so the rule can be expressed in SQL.
5. **GRN against a BOM-less PO.** Works today and needs nothing: `mis_grns.po_id`
   points at the PO, never at an order or BOM, and `commitReceipt` already posts
   a receipt with no PO at all. The one thing to watch is `MisGrnItem.type`
   (`GENERAL | FOR_ORDER`) and `forOrderRef` — a buffer-stock delivery should
   default to `GENERAL`, since the order it eventually serves is not known at
   receipt. The current GRN detail screen leaves the storekeeper to choose; make
   the default purpose-aware when MIS-277 is built.
6. **Inventory / ledger.** No consequence. `MisInventoryLedger` and
   `MisStoreTransaction` key off item and quantity, never off a PO's provenance.
   Stock from a buffer PO is indistinguishable from any other stock once
   received — which is correct.
7. **Order costing.** This is the real one. Material cost lands on an order when
   stock is **issued** with `type = FOR_ORDER`, not when it is bought. Buffer
   stock therefore sits as unattributed inventory value until issued, and if an
   issue is booked `GENERAL` by mistake the cost never reaches the order that
   consumed it. The BOM path used to make this self-correcting (bought for an
   order, issued to that order); the buffer path does not. Worth a report:
   *value received on buffer-stock POs vs value issued FOR_ORDER*, so drift is
   visible.
8. **Reporting that groups POs by order.** No such report exists yet
   (`reports.ts` has no PO surface at all), so nothing is broken today. Whoever
   builds it must bucket buffer-stock POs as their own group. An "unassigned" or
   "missing order" label would reintroduce exactly the assumption Arjun asked us
   to drop.
9. **Traceability.** `traceability.ts` walks order → BOM → production → QC → docs
   and never touches POs, so a buffer PO is invisible to it. Acceptable, but it
   means a batch made from buffer stock has no purchase document in its trace.
   Flag if the client ever needs supplier-level traceability for a complaint.
10. **The word "PO" means two things** in this project — the customer's incoming
    PO (E5) and the supplier PO (E9). Not introduced by this change, but this
    change touches only the second, and the ambiguity is a standing rework risk.

---

## 6. Optional migration — NOT applied

`prisma/migrations-pending/20260915000000_mis_po_purpose/migration.sql`

Adds `mis_po_purpose AS ENUM ('FOR_ORDER','BUFFER_STOCK')` and a
`purpose` column on `mis_purchase_orders` defaulting to `FOR_ORDER`, backfills
`BUFFER_STOCK` where `bom_ref IS NULL`, adds a CHECK keeping purpose and
`bom_ref` in step, and indexes purpose. Enum naming and `@@map` follow the
existing `mis_grn_item_type` / `mis_po_status` convention. Rollback is in the
file.

**Do not apply it yet.** It buys nothing the derived helper does not already
give, and it cannot be landed from this environment anyway: `prisma generate`
fails here (engine download 403), so any code referencing `MisPoPurpose` would
not compile until the client is regenerated on a networked machine. Promote it
when — and only when — SQL itself must filter or group on purpose: purpose-aware
approval limits (§5.4) or the PO-by-order report (§5.8).

---

## 7. Open risks

1. **Order costing drift** (§5.7) — buffer stock breaks the automatic
   bought-for-an-order → issued-to-that-order link. No control exists for it yet.
2. **Approval limits** (§5.4) — no purpose-aware threshold, and Arjun has not
   been asked whether he wants one. Buffer-stock spend is the easiest kind to
   over-order.
3. **"PO" means two different documents** (§4) — the E5 customer-PO tickets were
   left alone on the reading that Arjun meant the supplier PO. Confirm.
4. **Derived, not stored** (§2) — purpose is honest for rows created through
   `createPO`, but anything writing `mis_purchase_orders` directly (a seed, an
   import, a fix-up by hand) can still produce a `FOR_ORDER` PO with no
   reference. The CHECK constraint in §6 is what closes that for good.
