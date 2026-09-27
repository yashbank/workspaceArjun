# Masters / import walkthrough (MIS-66, MIS-75, MIS-91)

_Phase 15. A code-level trace through item import and batch traceability, with a pointer to the
passing test that proves each step. Not a browser walk (no dev server was running this
session)._

## MIS-75 — item import (`api/mis/inventory/import/route.ts`)

The route parses a `.csv`/`.xlsx` upload itself (header-column detection by fuzzy name match,
then a create-or-update loop) rather than delegating to a `server/mis/` function — noted as an
architecture-rule deviation (CLAUDE.md: "all business logic lives in `src/server/<domain>/`"),
not restructured: this phase is tests only, no application code.

| Case | What happens | Proven by |
|---|---|---|
| Empty sheet (header only) | Refused, `400` | `route.test.ts` "an empty sheet…" |
| Missing required `Name` column | Refused, `400`, message names the column | `route.test.ts` "a sheet missing the required Name column…" |
| Wrong file extension | Refused before the file is even parsed | `route.test.ts` "a non-csv/xlsx extension…" |
| 146-row real workbook shape | Every row created, `created`/`updated`/`skipped` counts exact | `route.test.ts` "every real row is created…" |
| A template placeholder row (`name` starts with "example") | Silently excluded — not created, not counted as skipped either | `route.test.ts` "a row whose name starts with example…" |
| Duplicate code within one file | The second occurrence **updates** the first-created row — never a thrown unique-constraint error, never two rows | `route.test.ts` "the second occurrence UPDATES…" |
| Duplicate SKU within one file (no code repeated) | Same update behaviour, matched by SKU instead | `route.test.ts` "matching by SKU alone…" |
| Unrecognised unit string | Falls back to the default (`PIECE`), row still created | `route.test.ts` "falls back to the default unit…" |
| Unrecognised category string | Falls back to `OTHER` the same way | `route.test.ts` "an unrecognised category…" |
| Item code containing `/` | **Bug, not verified-safe** — stored verbatim, breaking MIS_UI_SPEC §3's "codes use `-` not `/`" rule. New **F-36**. | `route.test.ts` "a code with a slash…" (`it.fails`) |

## MIS-66 — batch traceability

Already thoroughly covered by `traceability-view.test.ts`'s `describe('the lot', …)` block (6
tests) plus the order-chain's own material-receipt case — read in full before writing anything
new, and no gap was found worth a new test:

- Finds a receipt by batch number, case-insensitively, with supplier/PO/quantity/receiver.
- What the store issued of that item AFTERWARDS is listed per order, explicitly never claimed
  to be "from this lot" (no invented traceability the data doesn't support).
- The D4 visibility seam applies to a lot lookup exactly as it does to an order lookup.
- A database near-miss (wildcard-style match) is refused as a lot; an order number wins over a
  lot when a search string could match either.
- The order chain's own material section lists each BOM item's receipts with batch, quantity,
  time and person (`traceability-view.test.ts` "material: the receipts of each BOM item…").

Cited, not duplicated (`traceability-view.test.ts`, `traceability-money.test.ts`, 29 tests total).

## MIS-91 — shared test factories

`src/test/factories/mis.ts` (new): one builder per core entity (`makeEmployee`, `makeItem`,
`makeOrder`, `makePurchaseOrder`, `makePoItem`, `makeBomMaterial`, `makeAttendance`), each
returning a realistic-shaped row with sequential, collision-free ids and a `resetFactorySequence`
for test isolation — infrastructure for phases 16–18 to reuse rather than hand-roll fixtures
again. Proven by its own `mis.test.ts` (6 tests).

**Seed idempotency (`pnpm db:seed`) — confirmed by reading the code, not by executing it.**
`prisma/seed.ts` is a top-level script that connects to a real Postgres client at import time
(`main()` runs immediately) — it cannot be unit-tested without either refactoring it into an
exported, mockable function (an application-code change outside this phase's scope) or running
it twice against a real database, which this environment does not have. By inspection: every
write is either an `upsert` (workspace settings, keyed on `key`) or guarded by a `findFirst`
before `create` (the single storage-usage row) — both patterns are idempotent by construction. A
human should still run `pnpm db:seed` twice against a real/staging database once one exists and
confirm the row counts match, per MIS-91's own acceptance line.
