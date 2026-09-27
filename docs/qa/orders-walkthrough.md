# Orders / BOM / job-card walkthrough (E5: MIS-111 → MIS-134)

_Phase 16. D3 applies throughout: E5 is the customer side of the business, so every "PO" in
these tickets means **Customer PO** — a reference on the Order, never a `src/server/mis/po.ts`
record (that is the supplier PO, Phase 20's own territory, not touched here)._

## Automated (Vitest)

| Ticket | What | Proven by |
|---|---|---|
| MIS-111 | Order numbering under concurrency | `orders-numbering.test.ts` — 20 concurrent `createOrder` calls; **new F-38**, the generator is not collision-proof (`it.fails`) |
| MIS-114 | BOM tree integrity | `bom.test.ts` — `createBom` idempotent per order, stages/materials fully data-driven, `reorderBomStages` transactional, delete paths audited |
| MIS-120 | Money-leak hunt across BOM routes | `getBom` already covered for all 7 non-Owner roles (`wage-leak.test.ts`, F-06 BOM half, fixed 24C) — cited, not duplicated. `bom.test.ts` adds the one route that AST payload-scanning cannot see: `addBomMaterial` hands the audit writer the *whole row* by reference (not a literal object with named keys), so `audit-payloads.test.ts`'s static scan never sees `ratePerUnit` there at all — proven instead that a non-Owner's own read of the row it just created has the rate stripped (`forRole`), and audit.ts's own suite proves `redact()` strips `MONEY_FIELDS` regardless of call-site shape. |
| MIS-123 | Approval bypass attempts | `bom.test.ts` — direct call (SUPERVISOR), role escalation (QC), and **new F-37**: neither `submitBomForApproval` nor `approveBom` checks the BOM's current status first, so a stale/replayed request can approve a never-submitted or already-approved BOM (`it.fails`) |
| MIS-126 | Build a template without touching code | Satisfied by construction — `addBomStage`/`addBomMaterial` accept arbitrary names/quantities/units, nothing hardcoded per order type; proven by the same `bom.test.ts` case as MIS-114's data-driven check |

## Manual (MIS-117, MIS-129, MIS-131, MIS-134 — a phone, a printer, the client's real sample PO)

Not run this session (no device, no printer, no real client document available) — numbered
scripts for a human to execute once those exist, per the phase's own instruction not to fake
these as unit tests.

**MIS-117 — rebuild both real BOMs on a phone.**
1. On a phone (≤390px), open an order with no BOM yet.
2. Create the BOM, add every stage and material from one of the two real client BOMs on file.
3. Repeat for the second real BOM.
4. Confirm: every field was reachable and enterable at phone width; nothing required desktop.

**MIS-129 — end-to-end: Customer Order → BOM → approval → job card.**
1. Create an order, with the customer's own PO number recorded wherever intake currently notes
   it (see the honest gap below — there is nowhere in the app yet).
2. Build the BOM (stages, materials, rates).
3. Submit for approval; approve as Owner.
4. Issue the job card from the approved BOM; confirm production can be logged against it.
5. Confirm at every step the screen names the next action, per `listOrdersNeedingAction`'s own
   worklist logic (already covered structurally, not by this walkthrough).

**MIS-131 — print on real paper beside the Excel.**
1. Print the order/BOM/job-card documents this phase's tickets touch.
2. Lay each beside the client's own Excel-based equivalent.
3. Note every mismatch (layout, fields present/absent, units) in `qa/print-comparison.md`.

**MIS-134 — capture the real sample PO + duplicate handling.**
**Confirmed not built, not a QA gap to newly discover: `MisOrder` has no field for the
customer's own PO reference at all** (`prisma/schema.prisma` — no `customerPoRef`-shaped column;
matches the existing, already-logged note that this is "not recorded on orders yet", D4). This
walkthrough cannot be run until that field and its duplicate-handling rule exist — a build-phase
item, not something to invent here.
