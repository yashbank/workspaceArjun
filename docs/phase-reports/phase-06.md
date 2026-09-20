# Phase 6 · Line clearance

**Date:** 2026-09-19   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-137, MIS-148, MIS-149

## What was built (Half A — schema.prisma + migrations-pending only)
- `prisma/schema.prisma` — new `MisLineClearance` model (append-only: each "clear the
  line" action is a new row, which also gives MIS-149 its clearance history for free).
  Fields: `machineId` (required FK to `MisMachine`), `clearedById` (plain scalar, no FK —
  same pattern as `MisQcCheck.checkById`), `clearedAt`, `validityMinutes` (a snapshot of
  the business rule in force at clearing time), `expiresAt`, `notes`. Back-relation
  `MisMachine.lineClearances` added.
- `prisma/migrations-pending/20260918000000_mis_line_clearance/migration.sql` — idempotent
  DDL, FK to `mis_machines`, index on `(machine_id, expires_at)`, rollback block.
- No TypeScript references the new model yet, per the schema-gate rule.

**Verify:** `tsc --noEmit --skipLibCheck` silent (schema-only change, nothing to typecheck
against the new model yet).

## What was built (Half B, STEP 1 — mini schema gate, schema + migrations-pending only)
D7 changed (`DECISIONS.md`) from a fixed window to a **mode**: `JOB` (expires when the
machine's current order changes, default), `SHIFT` (expires at shift end), `MINUTES`
(fixed duration), plus an optional max-minutes cap on top of any mode.
- `prisma/schema.prisma` — new `MisLineClearanceMode` enum (JOB/SHIFT/MINUTES). On
  `MisLineClearance`: added `mode` (required, snapshot), `orderId`/`shiftId` (nullable
  FKs, `onDelete: SetNull`, for JOB/SHIFT event detection), widened `validityMinutes` and
  `expiresAt` to nullable (the cap is now optional). Added a second index
  `(machineId, clearedAt)` for the "latest clearance for this machine" lookup Half B's
  precondition will need regardless of mode. Back-relations added on `MisOrder` and
  `MisShift`. Append-only design and per-row snapshotting unchanged.
- `prisma/migrations-pending/20260919000000_mis_line_clearance_mode/migration.sql` —
  `ALTER TABLE` on the still-empty table from the first migration, idempotent, rollback
  block included.
- No TypeScript references the new columns yet, per the schema-gate rule.

**Verify:** `tsc --noEmit --skipLibCheck` silent.

## Decisions cited
**D7**, changed as above — cite it in Half B's server module and business-rule seed rather
than restating "JOB" or "120 minutes". **D6** (unrelated, found already in `DECISIONS.md`
but missing from the status board and misplaced after the file's footer) was fixed in the
prior session: added to the board, moved into sequence, footer restored to the true end.

## What changed for later phases
None.

## Pending — the next agent must do this first
**The gate.** Human runs from `Arjun/app`:
```bash
mv prisma/migrations-pending/20260918000000_mis_line_clearance prisma/migrations/20260918000000_mis_line_clearance
mv prisma/migrations-pending/20260919000000_mis_line_clearance_mode prisma/migrations/20260919000000_mis_line_clearance_mode
pnpm db:deploy && pnpm db:generate
```
Then Half B STEP 2 (MIS-148 BE precondition + `line-clearance.ts` seeding the `mode` and
cap as business rules, then MIS-149 FE clear-line action + history + Supervisor home amber
card per `R2-Supervisor.png`, gated on MIS-148's checker passing first) in a fresh session,
citing D7 for both the mode and the cap rather than hard-coding either.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-06.md

## Verified state after STEP 1 migrate (appended)

`mv` printed two "No such file or directory" errors because both destination folders already
existed — harmless, nothing was nested. Confirmed against the live DB:
`mis_line_clearances` has `mode` (NOT NULL), `order_id`, `shift_id`, and `validity_minutes` /
`expires_at` relaxed to nullable. 15 migrations applied, 0 pending. STEP 2 is clear to start.

**Loose end for a later phase (not Phase 6's job):** `prisma/migrations-pending/20260915000000_mis_po_purpose`
is still unapplied, and its timestamp is *older* than five migrations that are already applied.
It came from the PO-without-BOM change (see CHANGE_PO_WITHOUT_BOM.md §4) and is optional —
`poPurpose` is currently derived from `bomRef`, so nothing needs it. If it is ever applied it
will land out of order. Decide explicitly: either apply it with a re-dated folder name, or
delete it and drop the enum idea. Do not leave it to be found by accident.

## What was built (Half B, STEP 2 — MIS-148 + MIS-149, phase complete)

- `src/server/mis/business-rules.ts` — `getLineClearanceRule()` and `ensureLineClearanceDefaults()`
  seed/read `line_clearance.mode` (default `JOB`) and `line_clearance.max_minutes` (default
  `120`) as ordinary effective-dated rows, editable from the general Admin+Owner settings list
  (unlike AQL, D7 asked for no dedicated screen).
- `src/server/mis/line-clearance.ts` (**new**) — `assertLineCleared`, `getClearanceStatus`,
  `clearLine`, `listClearanceHistory`, `findLineClearanceBlocker`, and
  `LineClearanceBlockedError` (typed, names the machine and reason). Append-only: `clearLine`
  always `create`s, snapshotting the mode/cap in force at that instant.
- `src/lib/mis/permissions.ts` — new `clearance.read`/`clearance.write` actions, granted to
  OWNER (automatic), ADMIN, SUPERVISOR only.
- `src/server/mis/production.ts:5-19` — `logProduction()` now requires `machineId` (was
  optional) and calls `assertLineCleared` before writing. See **D8** below.
- `src/components/mis/production/production-screen.tsx`, `production-detail-screen.tsx` —
  both gained a machine picker, a try/catch around the log call, an amber blocked-state box
  showing the thrown error's message, and an inline "Clear the line" retry.
- `src/components/mis/home/supervisor-home.tsx`, `src/app/(mis)/mis/page.tsx` — new
  `clearanceBlocker` prop sourced from `findLineClearanceBlocker()`, rendered exactly per
  `R2-Supervisor.png` ("{machine} · {order} cannot start" + "Clear the line"). The
  pre-existing QC-failure card (mislabeled "Line clearance") now shows only as a fallback,
  relabeled "Quality hold", when no clearance blocker exists.
- `src/server/mis/line-clearance.test.ts` (**new**, 15 tests) — permission gate, append-only
  writes, NOT_CLEARED/EXPIRED, and JOB/SHIFT/MINUTES mode semantics.

**Verify:** `tsc --noEmit --skipLibCheck` silent · `pnpm vitest run` 449/449 passed ·
`pnpm build` 89/89 routes, clean.

## Decisions cited (addition)
**D7** for the mode/cap semantics and business-rule keys. **New: D8** added to
`DECISIONS.md` — making `machineId` required on `logProduction()` (was nullable) is a
behaviour change D7 mechanically requires but does not itself state, so it is recorded
rather than silently shipped. Confirm both with Arjun.

## What changed for later phases (addition)
**Phase 11** stamped `⚠ UPDATED BY PHASE 6` — `logProduction()`'s `machineId` is now
required, and the two production screens already carry the blocked-state UI Phase 11's
queue integration must preserve.

## Pending — the next agent must do this first (supersedes the earlier note)
None for Phase 6 itself. Two open questions sit in `DECISIONS.md` awaiting Arjun (D7, D8) —
not blocking, already recorded. The PO-purpose loose end above is still unclaimed by any
phase and remains a "someone should decide this" item, not a Phase 6 dependency.
