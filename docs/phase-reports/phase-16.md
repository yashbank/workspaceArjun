# Phase 16 · QA · orders, BOM and job cards

**Date:** 2026-09-27   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-111, MIS-114, MIS-117, MIS-120, MIS-123, MIS-126, MIS-129, MIS-131, MIS-134.
Epic E5.

## First task
Read §1A, the `PHASE_LOG.md` tail, and `phase-reports/phase-15.md` — nothing was marked pending
for this phase specifically. D3 read and cited throughout: E5 is the customer side, so every
"PO" in these tickets means Customer PO, never `server/mis/po.ts` (Phase 20's own territory,
never imported here).

## What was built
- **MIS-111:** `orders-numbering.test.ts` (new) — 20 concurrent `createOrder` calls. Found **new
  F-38**: `nextOrderNumber()` is not collision-proof (last-5-digits-of-`Date.now()`, no DB
  counter); two calls in the same millisecond compute the identical number and the second throws
  a raw unique-constraint error. Reproduces reliably (3/3 runs). Asserted spec-correct under
  `it.fails`.
- **MIS-114/120/123/126:** `bom.test.ts` (new, 11 cases) — BOM tree integrity (`createBom`
  idempotent per order, stages/materials fully data-driven — satisfies MIS-126 by construction,
  `reorderBomStages` transactional, delete paths audited); money isolation (a non-Owner's own
  `addBomMaterial` result has `ratePerUnit` stripped via `forRole`, covering the one route
  `audit-payloads.test.ts`'s static AST scan cannot see — `addBomMaterial` hands the audit writer
  a whole row by reference, not a literal object); approval bypass attempts (SUPERVISOR/QC
  refused). Found **new F-37**: neither `submitBomForApproval` nor `approveBom` checks the BOM's
  own current status — a stale request can approve a never-submitted or already-approved BOM.
  `getBom`'s own money-leak coverage (F-06, BOM half, fixed 24C) was read in full and cited, not
  duplicated.
- **MIS-117/129/131/134:** written as numbered manual walkthrough scripts in
  `qa/orders-walkthrough.md` and `qa/print-comparison.md`, per the phase's own instruction — not
  faked as unit tests (no phone/printer/real client documents this session). MIS-134's own
  walkthrough could not even be drafted as executable: `MisOrder` has no field for the customer's
  own PO reference at all (confirmed against `prisma/schema.prisma`), matching the already-logged
  D4 note ("not recorded on orders yet") — a build-phase item, not a new QA discovery.

## Decisions cited
D3 (Customer PO vs supplier PO — the whole phase's own frame, cited throughout, never
restated). D4 (customer PO reference not yet on the Order — MIS-134's walkthrough confirms this
is still true, does not reopen it).

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent. `pnpm vitest run`: **197 files, 4246 passed + 13
expected-fail** (was 195/4236 — 2 new files, +13 tests). No `pnpm build` — tests/docs only, no
application code changed.

## What changed for later phases
None.

## Pending
F-37, F-38 (both real bugs, small fixes, left for a build phase). MIS-134 needs the customer-PO
field built before its walkthrough can run at all.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-16.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/app/docs/qa/orders-walkthrough.md
- Arjun/app/docs/qa/print-comparison.md
