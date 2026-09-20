# Phase 3 · MIS user management & invites

**Date:** 2026-09-16   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-11, MIS-50, MIS-51

## Inherited work, done first
Phase 2's stamp: this phase must also add manager assignment, or `visibility.ts` stays
dead code. **Built as part of this phase, not deferred:**
- `src/server/mis/visibility.ts` — new `wouldCreateManagerCycle(employeeId, candidateId)`,
  reusing the resolver's own breadth-first descent rather than re-walking the tree. True for
  self-assignment and for any existing descendant.
- `src/server/mis/employee.ts:updateEmployee` — accepts `managerId` (`null` clears,
  `undefined` leaves unchanged), rejects a cyclic assignment before writing anything.
- `employee-screen.tsx` — a "Reports to" picker, options drawn from the same
  (D4-scoped) list the screen already received: a caller can only assign a manager from
  among people already visible to them. A rejected cycle shows inline, not as a page crash.
- New tests: `visibility.test.ts` (+3), `employee.test.ts` (new file, 4 tests) covering the
  cycle guard, a legal change, and that clearing/leaving `managerId` untouched neither
  checks nor writes it.

## What was built
- `src/lib/mis/permissions.ts` — new `'users.invite'` action, OWNER-only by construction —
  MIS-11's rule ("ADMIN may view but not invite") needed a permission `employees.read`
  doesn't express.
- `src/server/mis/users.ts` (+`.test.ts`, 30 tests) — reuses, never forks: `@/server/admin`'s
  `inviteUser` (seat-limit guard, stale-invite release, dedup, audit — all inherited) for a
  brand-new email at base role `'member'` always; a find-or-create `MisEmployee` link for an
  email that already has a workspace login (no seat spent). `listPendingMisGrants` surfaces
  workspace users with no `MisEmployee` yet — the invite pipeline cannot carry a `MisRole`
  through to acceptance (BR-001: no second invite table exists to hold one), so the Owner
  grants it from the same screen once the person accepts.
- `src/components/mis/settings/users-screen.tsx` + `/mis/settings/users/{page,actions}.ts` —
  phone-width card stack per MIS_UI_SPEC §4 (`max-w-[420px]`, `pb-24`, header card first),
  compared against `R1-Owner.png`. Seat counter is display-only text; enforcement stays
  server-side. Linked from `/mis/settings`; the invite button itself is further gated on
  `canInvite`.

**Verify:** `tsc --noEmit --skipLibCheck` silent, `eslint` clean on every touched file,
`pnpm vitest run` — 59 files / 423 tests pass, `pnpm build` — 87/87 routes (was 86 before
this phase).

## Decisions cited
None. D1–D4 do not bear on user invites or manager assignment directly (D4 is what
`wouldCreateManagerCycle` protects, but its value is not restated here).

## What changed for later phases
- **Phase 14** — stamped: MIS-52 must test both invite outcomes (immediate link vs.
  pending-grant), not just the happy path; extend the permission matrix for `users.invite`.
- **Phase 2's stamp on this section** — replaced with what was actually built, so the next
  reader sees current state, not a superseded instruction.

## Pending — the next agent must do this first
None. An org chart still has to be entered by hand for D4 to narrow anything — that is
expected data-entry work, not a code gap, and Phase 8 already carries a note about it.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-03.md
