# Phase 21 · PO decisions — implements D1, D2 and D3

**Date:** 2026-09-26   **Model:** sonnet   **Result:** Half A complete — awaiting migrate
**Tickets:** MIS-275, MIS-295

## What was built (Half A — schema.prisma + migrations-pending only)

Read first: `DEVELOPMENT_GUIDE.md` §1A and Phase 21's own section, `DECISIONS.md` D1/D2/D3,
`PHASE_LOG.md` tail, `phase-reports/phase-20.md`, `CHANGE_PO_WITHOUT_BOM.md`.

**D2 does not say how `OWNER_ONLY`/`ADMIN_ONLY`/`BOTH` are actually chosen** — only that purpose
is not the axis. That is a real, undecided mechanism (what is "the threshold" a threshold OF?),
so it is recorded as **D34** rather than guessed silently into code — see `DECISIONS.md`. The
assumed shape: one effective-dated rupee threshold (`PO_APPROVAL_THRESHOLD`); below it a PO needs
`ADMIN_ONLY`, at or above it `BOTH`; `OWNER_ONLY` is a manual override, never chosen automatically.
Decided once, at submission, from the threshold in force that day, and frozen onto the PO —
never re-derived, matching the acceptance check ("a threshold change… never re-opens a PO
already approved").

- **`prisma/schema.prisma`:**
  - **`MisPurchaseOrder.purpose`** (new column, `MisPoPurpose` enum, default `FOR_ORDER`) — D1.
    Promotes what `lib/mis/po-purpose.ts` already derives from `bomRef` into a real column, so
    SQL can filter/group on it (D1's buffer-drift report needs exactly this). `@@index([purpose])`.
  - **`MisPurchaseOrder.approvalMode`** (new, `MisPoApprovalMode?` — `OWNER_ONLY`/`ADMIN_ONLY`/
    `BOTH`, null until submitted) — D2/D34.
  - **`MisPurchaseOrder.adminApprovedById`/`adminApprovedAt`** (new) — `BOTH` mode's first step.
    The existing `approvedById`/`approvedAt` become the FINAL sign-off for every mode (Admin's
    for `ADMIN_ONLY`, Owner's for `OWNER_ONLY` and for `BOTH`'s second step).
  - Two new enums: `MisPoPurpose`, `MisPoApprovalMode`.
  - **No TypeScript references any of this yet**, per the schema-gate rule.
- **Two migrations to promote together** (both are this phase's gate):
  - `prisma/migrations-pending/20260915000000_mis_po_purpose/` — **already written**, from the
    original PO-without-BOM change (`CHANGE_PO_WITHOUT_BOM.md` §6 named this exact moment as
    when to apply it). Unchanged; verified it still matches the current `MisPurchaseOrder`
    shape before promoting.
  - `prisma/migrations-pending/20260927000000_mis_po_approval_chain/` (new, this phase) — the
    `approval_mode`/`admin_approved_by_id`/`admin_approved_at` columns and the new enum.
- **`docs/DECISIONS.md`** — new **D34** (the approval-mechanics assumption above), plus the D2
  index row now points at it.

**Verify:** `node_modules/.bin/tsc --noEmit --skipLibCheck` prints nothing (schema-only change).
No vitest/build run — nothing yet references the new columns.

## Decisions cited
D1 (buffer-stock costing — the `purpose` column is D1's own report's prerequisite, not itself a
costing rule). D2 (identical thresholds, no purpose axis — enforced by construction: nothing in
either migration or the schema reads `purpose` when deciding `approvalMode`). **New: D34**
(threshold mechanics, above).

## What changed for later phases
None yet — Half B is the next session on Phase 21 itself.

## Pending — the next agent must do this first

**The gate.** Human runs from `Arjun/app`:
```bash
mv prisma/migrations-pending/20260915000000_mis_po_purpose prisma/migrations/20260915000000_mis_po_purpose
mv prisma/migrations-pending/20260927000000_mis_po_approval_chain prisma/migrations/20260927000000_mis_po_approval_chain
pnpm db:deploy && pnpm db:generate
```
Then confirm: `grep -n "model MisPurchaseOrder" -A 25 prisma/schema.prisma` shows `purpose` and
`approvalMode` as real fields, and a quick check that the live `mis_purchase_orders` table
backfilled `purpose = 'BUFFER_STOCK'` correctly for its 2 pre-existing `bom_ref IS NULL` rows
(the migration's own `UPDATE` does this; confirm it landed).

Then **Half B** (new session): `submitForApproval` computes the PO's total internally (never
returned to a non-Owner caller) and decides `approvalMode` from `PO_APPROVAL_THRESHOLD` (seed the
rule in `business-rules.ts`, effective-dated); `approvePO` becomes mode-aware (single step for
`OWNER_ONLY`/`ADMIN_ONLY` — role-checked; two steps for `BOTH`, Admin then Owner specifically).
D1's buffer-drift report in `reports.ts` (value received on `BUFFER_STOCK` POs vs value issued
`FOR_ORDER`, bucketed as its own group — never "unassigned"). D3's copy-only rename pass (customer
PO → "Customer Order", supplier PO → "Purchase Order" — no model/route renames). Re-run/extend
Phase 20's `po-buffer-stock.test.ts` cases to prove the new approval chain does not reopen the
"no surface renders a buffer PO as incomplete" guarantee. A test must assert explicitly that a
buffer-stock PO and an order-linked PO of the same value take the SAME approval path (D2's own
acceptance check, "so a future purpose-aware rule cannot be added by accident").

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-21.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/app/docs/CHANGE_PO_WITHOUT_BOM.md
- Arjun/app/docs/qa/store-walkthrough.md
