# Phase 21 · PO decisions — implements D1, D2 and D3

**Date:** 2026-09-26   **Model:** sonnet   **Result:** DONE
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

## What was built (Half B — server logic, reports, tests)

Migration confirmed landed first (`grep -n "model MisPurchaseOrder" -A 25 prisma/schema.prisma`
shows `purpose`/`approvalMode`/`adminApprovedById`/`adminApprovedAt` as real fields on the
regenerated client).

- **`business-rules.ts`** — new `PO_APPROVAL_THRESHOLD_KEY` rule (default seeded at ₹50,000,
  idempotent like the AQL/line-clearance defaults) and `getPoApprovalThreshold()` (ungated read,
  same "gate the write, not the read" pattern as `getLineClearanceRule` — a policy figure, not a
  PO's own value). Writes still go through the existing generic `settings.write` editor; no
  dedicated screen needed for one number.
- **`po.ts`** — `submitForApproval` now computes the PO's total via a new internal-only
  `sumPoItems` (never exported, never returned) and decides `approvalMode` from the threshold:
  below it `ADMIN_ONLY`, at or above it `BOTH` — purpose is never read (D2's identical-threshold
  rule, enforced by construction). Takes an optional `{ forceOwnerOnly: true }`, D34's manual
  override, refused unless the caller is Owner. `approvePO` is now mode-aware: `BOTH`'s first step
  (any `po.write` holder — only Admin/Owner hold it) sets `adminApprovedById`/`adminApprovedAt`
  without changing status; the final step (Admin/Owner for `ADMIN_ONLY`, Owner only for
  `OWNER_ONLY` and `BOTH`'s second step) sets the existing `approvedById`/`approvedAt` and flips
  `APPROVED`. A status guard refuses approving anything not `PENDING_APPROVAL`.
- **`reports.ts`** — new `getBufferDriftReport(range)` (D1): value received on `BUFFER_STOCK`
  POs vs `FOR_ORDER` POs in the same period, bucketed by the PO's own `purpose` column (this
  phase's Half A prerequisite) so every GRN line lands in exactly one bucket, never a third
  "unassigned" group. All money — gated `wages.read`, not `reports.read`, matching `computePoTotal`.
- **D3's rename pass — verified complete, nothing to change.** Re-read D3 directly rather than
  the (mistaken) note left in Half A's own pending section: D3's assumed value calls the
  customer's document **"Customer PO"**, not "Customer Order". The one live string
  (`d4.notRecorded` in `order-detail-desktop.tsx`, both locales) already says "customer PO"
  correctly. Supplier-side screens already say "Purchase Orders"/"PO" consistently. Grepped
  `orders`/`po` screens for a stray bare "PO" meaning the customer's document — none exists; the
  customer-PO-capture UI itself isn't built yet (D3/D4 already note this). No code changed.
- **Tests:** extended `po-buffer-stock.test.ts` (+5: same-value BUFFER_STOCK/FOR_ORDER POs take
  the identical path — D2's own acceptance check; below-threshold single-step; at/above two-step,
  an Admin's first step cannot also give the final sign-off; the `forceOwnerOnly` override refused
  for non-Owners; a threshold change after submission never reopens an already-decided PO). New
  `reports-buffer-drift.test.ts` (4: bucketing arithmetic, legacy null-purpose reads as buffer
  stock, out-of-range exclusion, `wages.read` refusal). Registered both new functions in
  `permission-matrix.test.ts`'s TABLE/`NOT_A_DOOR`, `server-gates.test.ts`'s `REVIEWED_UNGATED`,
  and `wage-rule-keys.test.ts`'s `NON_WAGE_READS` (D2/D34 — a policy threshold, not a wage rate).

## Decisions cited
D1 (buffer-stock costing — the drift report's own reason to exist). D2 (identical thresholds,
enforced by construction: `submitForApproval` never reads `purpose`). D3 (re-confirmed, not
restated — "Customer PO" is already the correct term everywhere it appears). D34 (the threshold
mechanics from Half A, now implemented exactly as assumed).

## What changed for later phases
None. The approval chain, drift report and rename pass were self-contained; nothing here narrows
or reopens a later phase's scope.

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent throughout. `pnpm vitest run`: **192 files, 4187 passed + 9
expected-fail** (was 191/4170 — 1 new file, +17 tests). `pnpm build`: passes, every route. Run
once each, at the end, per the token-budget discipline this session adopted (`mis-fast-phase`).

## Pending
Nothing blocks Phase 23. D3 remains formally ASSUMED (awaiting Arjun) even though this phase found
nothing needing a change under it. `approvals-screen.tsx` was not touched — its existing "Approve"
button already drives the mode-aware `approvePO` correctly end to end (an Admin's click on a
`BOTH`-mode PO records the first step without changing status; a later Owner click finalises), but
the screen has no visual "step 1 of 2 done, awaiting Owner" indicator. Cosmetic, not a build phase.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-21.md
- Arjun/app/docs/qa/FINDINGS.md
