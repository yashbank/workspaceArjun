# Store / PO walkthrough — buffer-stock PO (MIS-279)

_Phase 20. A code-level trace through the buffer-stock PO feature (already built, previously
untested — no `po.test.ts` existed before this phase) plus the partial-receipt arithmetic, with
a pointer to the passing test that proves each step. Not a browser walk (no dev server was
running this session) — every step below is exercised by `po-buffer-stock.test.ts` and
`lib/mis/po-purpose.test.ts`._

## The two paths

```
Customer order ─ BOM / material request ─ PO (FOR_ORDER, bomRef set)  ─ Approval ─ Supplier ─ GRN ─ Inventory
                                          PO (BUFFER_STOCK, bomRef null) ──────────────────────┘
```

`purpose` is not its own column — `mis_purchase_orders.bom_ref` already carries the whole
signal (`lib/mis/po-purpose.ts`). `createPO` is the one gate that keeps it honest:

| Step | What happens | Proven by |
|---|---|---|
| Raise a buffer PO | `createPO({ purpose: 'BUFFER_STOCK' })` — no reference required, none accepted even if typed | `po-buffer-stock.test.ts` "switching to BUFFER_STOCK strips a reference…" |
| Raise a FOR_ORDER PO with no reference | Refused, with a message pointing at the buffer-stock path instead of a bare "required field" error | `po-buffer-stock.test.ts` "FOR_ORDER with no reference is refused…" |
| Approve it | Same `submitForApproval` → `approvePO` path either kind takes — no purpose-specific branch, so a buffer PO is never treated as second-class in the queue | (existing `po.ts` code path, unchanged by this phase) |
| Receive it (`commitReceipt`) | Posts to the general inventory ledger exactly like any other delivery; the GRN line's own `type` defaults to `GENERAL` regardless of the PO's purpose — the buffer/for-order split lives on the PO's `bomRef`, not on the GRN line (**classification-on-issue, not on purchase** — MIS-273's own wording) | `po-buffer-stock.test.ts` "classification-on-issue" |
| Read it back anywhere (Owner view, store dashboard, GRN verify) | `poPurpose(po)` derives the label from `bomRef` — a `null` reads as buffer stock whether it was created that way or is a pre-existing row nobody tagged | `lib/mis/po-purpose.test.ts` |
| No surface treats it as incomplete | `createPO`/`getPO`/`commitReceipt` all succeed plainly for a buffer PO — nothing checks for a BOM reference except the one refusal above, and that refusal only fires for `FOR_ORDER` | `po-buffer-stock.test.ts` "buffer PO end to end… no special error state" |

## Partial-receipt arithmetic, to the paisa

Order 100 units, received in two deliveries:

| After | Received (cumulative) | Outstanding | Ledger balance | PO status |
|---|---|---|---|---|
| Delivery 1 (40) | 40 | 60 | 40 | `PARTIAL` |
| Delivery 2 (35) | 75 | 25 | 75 | `PARTIAL` (never auto-completes short of 100) |
| Delivery 3 (25) | 100 | 0 | 100 | `COMPLETE` |

Proven by `po-buffer-stock.test.ts` "order 100, receive 40 then 35…". `commitReceipt` computes
`complete` by comparing every PO line's `receivedQuantity` to its `quantity` — a PO with several
lines only completes once ALL of them are fully received (not tested with a multi-line PO in
this phase; single-line is what the acceptance check asks for).

## What this does NOT cover

- A real browser walk of the PO/store screens (`po-list-screen.tsx`, `receive-screen.tsx`,
  the Owner's Buffer-stock report group) — code-only this session.
- Multi-line PO partial receipt (each line completing independently before the PO as a whole
  does) — the single-line case above is what MIS-279's own acceptance check specifies.
- D1's costing claim ("a buffer PO posts to the general pool and costs no order until the stock
  is issued") — `commitReceipt` posts every delivery to the general ledger identically regardless
  of purpose, so there is nothing today that COULD charge an order at receipt time either way;
  this is consistent with D1, not a separate proof of it.
