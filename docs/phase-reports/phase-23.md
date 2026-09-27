# Phase 23 · The parked-writes inbox — Appendix B §B.7

**Date:** 2026-09-27   **Model:** sonnet   **Result:** DONE
**Tickets:** None yet — Appendix B §B.7 requires this phase but no ticket was ever written for
it (documented, not fabricated, per Phase 11's own precedent). Raise one in E8; record its key
in `PHASE_LOG.md` when it exists.

## First task
Read §1A, `DEVELOPMENT_GUIDE.md`'s own Phase 23 section (including its Phase 10/11/13/14
stamps), the `PHASE_LOG.md` tail, and `phase-reports/phase-21.md`. Nothing was marked pending
for this phase specifically. No schema change needed — `MisQueuedWrite` already carries every
column the inbox uses (`resolvedAt`/`resolvedById`/`resolutionNote`); this is a build phase, not
a SCHEMA GATE.

## What was built

**`lib/mis/permissions.ts`** — new `queue.review` action: OWNER (via `MIS_ACTIONS`), ADMIN, and
SUPER_ATTENDANCE_OPERATOR. This is the door into the inbox at all; which ROWS a holder actually
sees is filtered again, per kind, by that kind's own domain read permission
(`production.read`/`attendance.read`) — the Phase 14 stamp's own warning ("F-13 is exactly the
mistake of one permission over three kinds of data") means a Super Attendance Operator (who
holds `queue.review` + `attendance.read` but not `production.read`) sees punch-kind parks only.

**`server/mis/idempotency.ts`** — `listParkedWrites`/`getParkedWriteDetail` (both `PARKED` and
`REJECTED`, unresolved, filtered by the kind-permission rule above) and `discardParkedWrite`
(`queue.review` alone, a reason required, audited — never applies anything). `RunOptions` gained
an `override` field (`by`/`note`/`skipTiming`/`skipClearance`/`skipEmployeeChecks`): an
inbox-initiated resolve or override by someone other than the original actor, which is the whole
reason this phase exists ("a tablet nobody is holding"). It lets a `PARKED` row past the
plain-retry gate, skips `checkTiming` when built for `CLOCK_SKEW`/`TOO_OLD` (§B.10.4: only a
person may vouch for a wrong clock — a plain retry can never clear these), and records the
*resolver* — not the original `actorId` — as `resolvedById`/`resolutionNote`.

**`server/mis/production.ts`** / **`server/mis/attendance-punch.ts`** — each gained the narrow
bypass its own park reasons need, gated behind `options.override` only:
`submitProductionLog`/`submitPunch` skip the `queuedBy !== user.id` identity check (§B.10.2) —
an office resolver is by definition not the original actor. `createProductionLog` gained
`skipClearance` (§B.5.1: a `clearance.write` holder confirms the entry against the clearance
that was in force *then*, never a fresh one laundered into covering it — `assertLineCleared` is
skipped, not satisfied). `applyPunch` gained `skipEmployeeChecks`, covering `EMPLOYEE_INACTIVE`
and `CORRECTION_WINDOW_CLOSED` only — never `BADGE_UNKNOWN`, which keeps its own resolution (the
tablet's Fix, K2, `correctsKey`).

**`server/mis/queue-resolve.ts`** (new) — `resolveParkedWrite(key, note)`: the one "apply past a
park" door. Reads the row, decides which extra permission this reason needs from a fixed table
(retryable reasons need nothing beyond `queue.review`; `CLEARANCE_*` needs `clearance.write`;
`CLOCK_SKEW`/`TOO_OLD`/`EMPLOYEE_INACTIVE`/`CORRECTION_WINDOW_CLOSED` need `attendance.write`),
then calls the SAME `submitProductionLog`/`submitPunch` the live/device path calls, with the
`override` built for that reason (B.9: no second write path). `BADGE_UNKNOWN` and
`PREDECESSOR_PARKED` are refused here on purpose — the first has its own device-side resolution,
the second never reaches the server as a row at all (it is a client-side local hold in
`lib/mis/offline/queue.ts`; resolving its blocker releases it via the device's own FIFO, nothing
for this phase to build).

**`app/(mis)/mis/queue/page.tsx`** + **`actions.ts`** + **`components/mis/queue/parked-writes-screen.tsx`**
(all new) — absent (404) for a role without `queue.review`, matching D30's own precedent. Each
row shows the payload, the reason (code + a plain-English sentence), and the evidence
(`clientRecordedAt`, device, attempts); a clearance park additionally shows `parkDetail` (the
clearance that was in force *then*) beside a live `getClearanceStatus` read (*now*). A reason of
≥3 characters is required for both Resolve and Discard. Empty state uses the shared kit
`EmptyState`, not a bespoke one. A resolve that genuinely fails (the world has not actually
changed) returns its outcome to the screen rather than silently doing nothing.

**`server/mis/navigation.ts`** — new `queue` nav entry (`requires: 'queue.review'`), and a
`queue` badge count (via `listParkedWrites().length`) added to OWNER's, ADMIN's, and
SUPER_ATTENDANCE_OPERATOR's `getNavBadges` branches.

**`components/mis/home/*-home.tsx`** — a count where it belongs, per the Touches list. Owner's
home folds a non-empty queue into the existing "Needs attention" alerts list (no new card — it
already exists for exactly this kind of thing). Admin's home gets a small dedicated
WarnCard/OkCard pair, the same shape as the existing "Data health" (Hindi-name) card.

## Decisions cited
None new. Every design choice here (the `override` mechanism, the kind-permission split, the
resolver-not-original-actor audit attribution) is Appendix B's own text (§B.5.1, §B.5.2, §B.10.2,
§B.10.4), not an invented policy — nothing here rose to a D-number.

## Honest gaps, not built
- The evidence panel shows `actorId`/`deviceId` as raw ids, not a resolved employee/device name
  — `MisQueuedWrite` carries no relation to join through, and adding one is a small schema
  change this phase's own scope didn't call for. Cheap to add later (a name lookup per row, or a
  batched join) if this proves annoying in practice.
- No dedicated component test for `parked-writes-screen.tsx` — matches this codebase's existing
  convention (`po-list-screen.tsx`/`approvals-screen.tsx` have none either); coverage here is the
  server-side `queue-resolve.test.ts` (13 tests) plus `tsc`/build.
- No browser walkthrough — no dev server was run this session (matches recent QA/build phases'
  own disclosed limitation).

## Verification, honestly
`tsc --noEmit --skipLibCheck`: silent throughout. `pnpm vitest run`: **193 files, 4221 passed +
9 expected-fail** (was 192/4187 — 2 new files, +34 tests). `pnpm build`: passes, every route
including the new `/mis/queue`. Run once each, at the end, per this session's token-budget
discipline (`mis-fast-phase`).

## What changed for later phases
None. This phase is self-contained; nothing here narrows or reopens Phase 26's scope.

## Pending
Nothing blocks Phase 26. The three honest gaps above are cheap, optional follow-ups, not blockers.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-23.md
- Arjun/app/docs/qa/FINDINGS.md
