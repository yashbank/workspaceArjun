# Phase 10 · Offline write queue — the infrastructure

**Date:** 2026-09-19   **Model:** opus   **Result:** DONE
**Tickets:** MIS-25, MIS-85, MIS-86

## What was built (design + Half A — schema.prisma + migrations-pending only)

**The design, approved before any code, is `DEVELOPMENT_GUIDE.md` Appendix B.** It is the
specification Phases 11, 13 and 22 implement against. Its one sentence:

> A queued write passes exactly the same gates as a live one. When it fails those gates it
> is parked in front of a human, with its reason and its evidence — never dropped, never
> forced through, never quietly corrected.

Nine sections: what may be queued and what may never be (§B.1), the idempotency key
(§B.2), the five outcomes (§B.3), whose clock decides (§B.4), the Phase 6–9 gates one by
one (§B.5), ordering and backoff (§B.6), durability and the inbox (§B.7), the two designed
screens (§B.8), module boundaries (§B.9).

- `prisma/schema.prisma` — `MisQueuedWrite` + `MisQueuedWriteStatus`. The **client's
  idempotency key is the primary key**, so two racing replays are settled by the database
  rather than a read-then-write check that can lose.
- `prisma/migrations-pending/20260923000000_mis_queued_writes/migration.sql` — new table,
  three indexes, rollback block. Nothing existing is altered.
- No TypeScript references it yet, per the schema-gate rule.

**Verify:** `tsc --noEmit --skipLibCheck` silent · `npx prisma validate` passes ·
`pnpm vitest run` 565/565 (unchanged — schema-only).

## The four decisions inside the contract

1. **Sign-off is not queueable.** Its totals sit above the button by design (Appendix A
   §A.6, MIS-164) and offline they are missing every entry another device has not synced.
   This **contradicted two lines Phase 7 wrote**, both now corrected in place with a
   `⚠ CORRECTED BY PHASE 10` note: the Phase 11 stamp, and Appendix A §A.6 point 5.
2. **A closed order refuses production (D14)** — a check `logProduction()` does not have
   today, so this changes the online path too, which is the point: one rule, not two.
   Refusable, not permanently impossible — `reopenOrder(orderId, reason)` mirrors phase
   reopen so the system has **one mental model for every park**.
3. **Whose clock decides (D15)** — punches are client-recorded, sign-offs are
   server-stamped, and a clock outside tolerance **parks rather than clamps**.
   `K2-Offline-sync-queue.png` settles the punch half outright: it lists punches at 06:04
   and 06:11 while syncing at 07:41.
4. **A park is durable server-side**, carrying its payload — otherwise a lost or wiped
   tablet silently takes real production records with it.

## What changed for later phases

- **Phase 11** — stamp corrected (point 3 was about sign-off replay; sign-off is no longer
  queueable). It implements D14's check *and* `reopenOrder`, and must bring the business
  write and the idempotency row into one transaction — `logProduction()` currently writes
  its row and audits outside any transaction, which would make the dedupe a lie.
- **Appendix A §A.6** — point 5 corrected, same reason.
- **Phase 22 · The parked-writes inbox — added.** No phase in 0–21 owned the screen where a
  human reviews a parked write, which is the "queue with no inbox is a silent drop with
  extra steps" gap. Added to the §4 index and as a full section after Phase 21, with the new
  `queue.review` permission and the rule that `queue.review` alone can see and discard but
  never apply — applying past a park needs the underlying right (`clearance.write`, an
  Owner's `phase.reopen`, `orders.write`). **It has no Jira ticket; one must be raised in
  E8 before it runs.**

## Decisions cited
**D7** (clearance expiry — §B.5.1), **D8** (required machine — §B.5.5), **D10** (ungated
orders — the queue inherits it), **D11** (wastage reason is queueable), **D12** (the
resolve-by-a-named-person pattern the parks follow). **New: D14, D15.**

## Pending — the next agent must do this first
**The gate.** Human runs from `Arjun/app`:
```bash
mv prisma/migrations-pending/20260923000000_mis_queued_writes prisma/migrations/20260923000000_mis_queued_writes
pnpm db:deploy && pnpm db:generate
```
Then Half B in a fresh session: MIS-85 (BE — `src/server/mis/idempotency.ts`: the
transactional dedupe, the five-outcome classifier, the two business rules
`offline.clock_skew_minutes` and `offline.max_queue_age_hours`) with its checker, then
MIS-86 (FE — `src/lib/mis/offline/{queue,idempotency}.ts` importing nothing from
`src/server/**`, IndexedDB directly with no new dependency, a sender registry so the queue
imports no action, and `sync-indicator.tsx` matching `08-Empty-error-offline.png`) once
85's checker returns PASS.

## What was built (Half B — MIS-85 then MIS-86, phase complete)

**MIS-85 (BE)** — checker passed (tsc silent, lint clean, 590/590) before MIS-86 started.
- `src/lib/mis/offline/idempotency.ts` — **new**, pure and shared: the queueable kinds, the
  five outcomes, the park reasons, `TIME_SOURCE` per kind (D15), UUID key generation and
  validation, and `parkable()`/`rejectable()` so a domain module can label its own error
  without importing the classifier.
- `src/server/mis/idempotency.ts` — **new**: `runIdempotent()` writes the business row and
  the key row **in one transaction** (§B.7's one rule), `classifyFailure()` maps every real
  thrown error to an outcome, `checkTiming()` applies D15.
- `src/server/mis/business-rules.ts` — `getOfflineRules()` seeds and reads
  `offline.clock_skew_minutes` and `offline.max_queue_age_hours`, D7's mechanism.
- 25 tests, including the ten-replay case (one row, nine DUPLICATEs returning the original
  result), a lost race returning the winner's result, and one test per gate in §B.5.

**MIS-86 (FE)**
- `src/lib/mis/offline/queue.ts` — **new**: IndexedDB directly, no dependency. A
  **store seam** (`indexedDbStore` / `memoryStore`) makes the replay engine testable with
  no browser, and a **sender registry** means the queue imports no server action — both
  §B.9 requirements.
- `src/components/mis/shell/sync-indicator.tsx` — **new**, the three states of
  `08-Empty-error-offline.png`, mounted in the shell header. Red is tappable and opens the
  list with each entry's reason and a Retry.
- 17 tests: ordering by `clientRecordedAt`, the three-airplane-mode-writes case from
  MIS-86's own done-when, backoff with jitter, a park not blocking the queue behind it, and
  a clock-out parking when its clock-in parked.
- `dictionaries.ts` — 11 `sync.*` keys, English and Hindi.

**A real bug the tests caught:** a sender that threw *synchronously* took down the entire
replay pass. Now a try/catch, so it is a retry like any other failure.

**Verify:** `tsc --noEmit --skipLibCheck` silent · `pnpm vitest run` **607/607** ·
`pnpm build` clean · `src/lib/mis/offline/**` imports nothing from `src/server/**`
(grepped) · **no new dependency** — `package.json`'s only diffs are Phase 4's script rename
and an earlier phase's `date-fns`.

## Scope note — the service worker

The Touches list mentions `public/` — a service worker. **MIS-86's own text does not**, and
neither does any acceptance check here; the ticket is queue, replay and indicator. A service
worker is the *offline shell* (E8-03, PARTIAL) — it decides what is cached and how it
updates, which is a design question nobody has answered and which a wrong guess turns into
stale assets after a deploy. Not built, deliberately. **Phase 11 will need it**: the queue
keeps writes safe, but without a cached shell the production screen cannot load at all on a
dead link. Raise it as E8-03's remaining piece before Phase 11.

## Decisions cited (addition)
As Half A, plus **D14**/**D15** now implemented: D15's tolerances are live business rules,
and D14's `ORDER_CLOSED` is wired as a park reason waiting for Phase 11 to throw it.

## What changed for later phases (addition)
No new stamps beyond Half A's. Phase 11 inherits three concrete obligations, all recorded in
its section and in §B.7: re-resolve the phase at replay, bring `logProduction`'s write inside
one transaction with the idempotency row, and implement D14's check plus `reopenOrder`.

## Pending — the next agent must do this first (supersedes Half A's note)
Nothing for Phase 10. Two unclaimed items, both named above rather than left to be found:
**the service worker** (E8-03's remainder, which Phase 11 needs), and **Phase 22's Jira
ticket**, which does not exist yet and must be raised in E8 before that phase runs.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-10.md
